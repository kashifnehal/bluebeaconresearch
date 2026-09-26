// BBR Supabase Auth Domain Proxy — Cloudflare Worker
//
// Sits at auth.bluebeaconresearch.com (bound via a Cloudflare Route/custom
// domain — see infra/cloudflare/wrangler.toml and docs/brain/12_DEPLOYMENT.md
// §6) and forwards every request to the real Supabase project
// (evavcgfmemwryggdkjmx.supabase.co), rewriting the Host header so GoTrue/
// PostgREST/Storage see a normal same-origin request. Purpose: Google's OAuth
// consent screen and any redirect the user sees show
// "auth.bluebeaconresearch.com", never the raw *.supabase.co domain.
//
// Scope: REST (/rest/v1/*), Auth (/auth/v1/*), Storage (/storage/v1/*) over
// plain HTTP(S), and Realtime (/realtime/v1/*) over WebSocket. Everything is
// forwarded byte-for-byte (method, headers, body, cookies) — this Worker does
// not inspect, cache, or transform Supabase's request/response payloads. Its
// only job is Host-header rewriting and CORS.
//
// CORS is intentionally NOT a wildcard. ALLOWED_ORIGIN_LIST and
// ALLOWED_ORIGIN_PATTERN below are overridable via Worker environment
// variables (see wrangler.toml [vars]) but always default to BBR's real
// production domains and this project's actual Vercel preview naming
// pattern — never "*". A wildcard here plus Access-Control-Allow-Credentials
// would let any third-party site relay authenticated requests using a
// visitor's BBR session cookie.

const DEFAULT_SUPABASE_ORIGIN = "evavcgfmemwryggdkjmx.supabase.co";

// Exact-match allowed origins (production).
const DEFAULT_ALLOWED_ORIGINS = [
  "https://bluebeaconresearch.com",
  "https://www.bluebeaconresearch.com",
];

// Vercel preview deployments get a random hash per build
// (bluebeaconresearch-<hash>-kashif-nehals-projects.vercel.app) so they can't
// be listed as exact strings — matched by pattern instead, still scoped to
// this specific project + team, not every *.vercel.app site.
const DEFAULT_ALLOWED_ORIGIN_PATTERN =
  "^https://bluebeaconresearch-[a-z0-9]+-kashif-nehals-projects\\.vercel\\.app$";

function buildAllowlist(env) {
  const exact = new Set(
    (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",") : DEFAULT_ALLOWED_ORIGINS)
      .map((o) => o.trim())
      .filter(Boolean),
  );
  const patternSource = env.ALLOWED_ORIGIN_PATTERN || DEFAULT_ALLOWED_ORIGIN_PATTERN;
  const pattern = patternSource ? new RegExp(patternSource) : null;
  return { exact, pattern };
}

function isOriginAllowed(origin, allowlist) {
  if (!origin) return false;
  if (allowlist.exact.has(origin)) return true;
  if (allowlist.pattern && allowlist.pattern.test(origin)) return true;
  return false;
}

function corsHeaders(request, allowlist) {
  const origin = request.headers.get("Origin");
  const headers = new Headers();
  if (isOriginAllowed(origin, allowlist)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Vary", "Origin");
  }
  return headers;
}

function withCors(response, request, allowlist) {
  const merged = new Headers(response.headers);
  const cors = corsHeaders(request, allowlist);
  cors.forEach((value, key) => merged.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}

async function handlePreflight(request, allowlist) {
  const headers = corsHeaders(request, allowlist);
  if (headers.has("Access-Control-Allow-Origin")) {
    const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
    if (requestedHeaders) headers.set("Access-Control-Allow-Headers", requestedHeaders);
    headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    headers.set("Access-Control-Max-Age", "86400");
  }
  return new Response(null, { status: 204, headers });
}

async function proxyWebSocket(request, supabaseOrigin) {
  const upstreamUrl = new URL(request.url);
  upstreamUrl.protocol = "https:";
  upstreamUrl.hostname = supabaseOrigin;

  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set("Host", supabaseOrigin);

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
  });

  const upstreamResponse = await fetch(upstreamRequest);
  const upstreamSocket = upstreamResponse.webSocket;
  if (!upstreamSocket) {
    return new Response("Realtime upstream did not upgrade to WebSocket", { status: 502 });
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  server.accept();
  upstreamSocket.accept();

  server.addEventListener("message", (event) => {
    try {
      upstreamSocket.send(event.data);
    } catch {
      // Upstream already closed — closing the client side below is enough.
    }
  });
  upstreamSocket.addEventListener("message", (event) => {
    try {
      server.send(event.data);
    } catch {
      // Client already closed.
    }
  });

  const closeBoth = (code, reason) => {
    try {
      server.close(code, reason);
    } catch {}
    try {
      upstreamSocket.close(code, reason);
    } catch {}
  };
  server.addEventListener("close", (e) => closeBoth(e.code, e.reason));
  upstreamSocket.addEventListener("close", (e) => closeBoth(e.code, e.reason));
  server.addEventListener("error", () => closeBoth(1011, "client error"));
  upstreamSocket.addEventListener("error", () => closeBoth(1011, "upstream error"));

  return new Response(null, { status: 101, webSocket: client });
}

async function proxyHttp(request, supabaseOrigin) {
  const url = new URL(request.url);
  url.protocol = "https:";
  url.hostname = supabaseOrigin;
  url.port = "";

  const headers = new Headers(request.headers);
  headers.set("Host", supabaseOrigin);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const init = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
  };

  return fetch(url.toString(), init);
}

export default {
  async fetch(request, env) {
    const allowlist = buildAllowlist(env);
    const supabaseOrigin = env.SUPABASE_ORIGIN || DEFAULT_SUPABASE_ORIGIN;

    if (request.method === "OPTIONS") {
      return handlePreflight(request, allowlist);
    }

    try {
      if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
        // Realtime connections carry no CORS-relevant browser semantics
        // (the browser doesn't enforce CORS on WebSocket upgrades), so no
        // CORS headers are added here — only plain HTTP responses need them.
        return await proxyWebSocket(request, supabaseOrigin);
      }

      const upstreamResponse = await proxyHttp(request, supabaseOrigin);
      return withCors(upstreamResponse, request, allowlist);
    } catch (err) {
      return withCors(
        new Response(JSON.stringify({ error: "auth_proxy_upstream_error" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
        request,
        allowlist,
      );
    }
  },
};
