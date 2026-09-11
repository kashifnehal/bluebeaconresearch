import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isProjectReady } from "@/lib/flags";

// Routes that can be accessed when the project is not ready (Gate Active)
const GATED_ALLOWED = [
  "/login",
  "/signup",
  "/auth", // /auth/callback etc. needed for oauth/email confirmation
  "/verify", // "check your email" post-signup state — must stay reachable so a
  // gated signup can still confirm their address, not just OAuth
  "/confirm", // receiving end of the signup confirmation email link
  "/forgot-password",
  "/reset-password",
];

// Page routes that require an authenticated session.
//
// NOTE: /api/* is deliberately NOT listed here. Every API route authenticates
// independently — user-scoped routes via getRouteSupabaseClients() (lib/
// supabase-server.ts), and the handful of public ones (/api/prices,
// /api/prices/history, /api/backtesting, /api/ingestion/status) are explicit
// public-data endpoints that are still rate-limited. Middleware must not run an
// auth check for them: doing so put the entire API surface behind the auth
// backend's latency (see incident note below).
const PROTECTED = [
  "/dashboard",
  "/events",
  "/watchlist",
  "/alerts",
  "/backtesting",
  "/settings",
  "/onboarding",
];

// Incident-response hardening (2026-08-28): a degraded Supabase auth gateway made
// every supabase.auth.getUser() call stall for minutes. Because middleware ran
// that call on *every* request (matcher below covers all non-asset paths), the
// whole site — marketing pages, /login, /signup, /api/* — returned 504
// GATEWAY_TIMEOUT, not just the dashboard.
//
// Two changes contain that blast radius:
//   1. Only call getUser() for PROTECTED page routes. Everything else returns
//      immediately without touching Supabase.
//   2. Bound the getUser() call to AUTH_CHECK_TIMEOUT_MS via Promise.race (do
//      not AbortController-cancel the in-flight Auth HTTP request — that made
//      GoTrue log "context canceled" / postgres dial canceled and worsened the
//      2026-09-09 incident). On timeout — or any auth error, or missing env —
//      fail CLOSED: redirect to /login exactly like an unauthenticated request.
//      A protected route never falls open. 8s: a real GET /user took 6.4s and
//      succeeded in that incident; 3s sat inside normal tail latency.
const AUTH_CHECK_TIMEOUT_MS = 8000;
const AUTH_CHECK_TIMEOUT = { timedOut: true } as const;

function logAuthCheckError(err: unknown, phase: "failed" | "background") {
  const e = err as { name?: string; message?: string; code?: string };
  console.error(
    phase === "failed"
      ? "Middleware auth check failed:"
      : "Middleware auth check (background):",
    {
      name: e?.name,
      message: e instanceof Error ? e.message : String(err),
      code: e?.code,
    },
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Gate: if project is NOT ready, block everything except /login, /signup, /auth, /api, and static assets ──
  if (!isProjectReady) {
    const isAllowed =
      pathname === "/" ||
      GATED_ALLOWED.some((p) => pathname.startsWith(p)) ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/_next/") ||
      pathname === "/favicon.ico" ||
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml";

    if (!isAllowed) {
      // Redirect to root – modal is shown there
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Allow the request to proceed (e.g., to /signup or /api)
    return NextResponse.next();
  }

  // ── Normal flow when project IS ready ────────────────────────────────────
  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Public routes (marketing pages, /login, /signup, /auth/*, /api/*, status,
  // legal, …) never need a session check here. Skip Supabase entirely so
  // auth-backend latency cannot affect them.
  if (!isProtected) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "⚠️ Middleware: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — failing closed on protected route.",
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() validates the JWT server-side against Supabase, so expired or
  // revoked tokens are rejected in production. Race against a timer rather
  // than aborting fetch: the request may still complete in the background.
  let user = null;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const getUserPromise = supabase.auth.getUser();
  try {
    const result = await Promise.race([
      getUserPromise,
      new Promise<typeof AUTH_CHECK_TIMEOUT>((resolve) => {
        timer = setTimeout(
          () => resolve(AUTH_CHECK_TIMEOUT),
          AUTH_CHECK_TIMEOUT_MS,
        );
      }),
    ]);
    if ("timedOut" in result) {
      timedOut = true;
      // Let getUser() finish in the background; swallow a later rejection so
      // it does not become an unhandled promise.
      void getUserPromise.catch((err: unknown) => {
        logAuthCheckError(err, "background");
      });
    } else {
      if (result.error) throw result.error;
      user = result.data.user;
    }
  } catch (err: unknown) {
    // Genuine "no session" / AuthApiError — a protected route with no
    // verified user. Timeout is handled via the sentinel above, not here.
    logAuthCheckError(err, "failed");
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    if (timedOut) {
      loginUrl.searchParams.set(
        "error",
        "Authentication is temporarily unavailable. Please try again in a moment.",
      );
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
