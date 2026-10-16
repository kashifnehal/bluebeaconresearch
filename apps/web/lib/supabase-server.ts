import { createServerClient } from "@supabase/ssr";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAuthUrl } from "./supabase-auth-url";

export type RouteVerifyMode = "claims" | "server";

type ClaimsAuth = {
  getClaims: () => Promise<{
    data: { claims?: { sub?: string; email?: string } } | null;
    error: unknown;
  }>;
};

type ServerAuth = {
  getUser: () => Promise<{ data: { user: User | null } }>;
};

/**
 * "claims" verifies the access token locally (asymmetric key, cached public
 * keys). A banned or deleted user keeps read access until their access token
 * expires (the token lifetime set in Supabase Auth). "server" calls getUser(),
 * which checks the Auth server on every call.
 */
export async function resolveRouteUser(
  auth: ClaimsAuth & ServerAuth,
  verify: RouteVerifyMode = "server",
): Promise<User | null> {
  if (verify === "claims") {
    const { data, error } = await auth.getClaims();
    const sub = data?.claims?.sub;
    if (error || !sub) return null;
    return { id: sub, email: data?.claims?.email } as User;
  }
  const {
    data: { user },
  } = await auth.getUser();
  return user;
}

export type RouteSupabaseClients = {
  /** Cookie-scoped client bound to the request's own session — the only client that
   *  should ever be used to decide whether a request is authorized. */
  supabaseAuth: ReturnType<typeof createServerClient>;
  /** Prefers service-role (bypasses RLS) when SUPABASE_SERVICE_ROLE_KEY is set, else
   *  falls back to supabaseAuth. For data reads AFTER an auth decision has already
   *  been made from `user` below — never use this client's mere availability as the
   *  auth decision itself (that exact mistake once caused a real bug: an unauthenticated
   *  SSE request could read live data because service-role being configured, not an
   *  authenticated user, was gating the response — see events/stream/route.ts history). */
  supabase: ReturnType<typeof createServerClient> | ReturnType<typeof createServiceClient>;
  user: User | null;
};

/**
 * Builds the pair of Supabase clients most authenticated API routes need, plus the
 * resolved user. Extracted 2026-08-18 after this exact cookies()+createServerClient
 * boilerplate had been hand-copied into 4 separate routes (alerts/recent, signals,
 * signals/[id], events/stream) — the same divergence pattern that let the SSE 401 bug
 * happen in the first place. This function only builds clients and resolves `user`;
 * each caller keeps making its own auth-enforcement decision (401 vs dev-mode
 * fallback vs RLS-scoped-only reads) exactly as before — that policy differs
 * legitimately per route and is not something to collapse into one shared behavior.
 */
export async function getRouteSupabaseClients(options?: {
  verify?: RouteVerifyMode;
}): Promise<RouteSupabaseClients | null> {
  // REST/DB reads (the `supabase` client below) always use the raw project
  // URL — only the auth-decision client (`supabaseAuth`) can be routed
  // through the auth.bluebeaconresearch.com proxy. See lib/supabase-auth-url.ts.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const authUrl = getSupabaseAuthUrl();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !authUrl || !supabaseAnonKey) return null;

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(authUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  const user = await resolveRouteUser(supabaseAuth.auth, options?.verify ?? "server");

  // SUPABASE_SECRET_KEY is Supabase's newer key-naming scheme; Vercel has
  // been migrated to it while Railway still uses the legacy name. Accept
  // either so a privileged client is available regardless of which platform
  // set which name (see SUPABASE_SERVICE_ROLE_KEY gap, 2026-09-26).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const supabase = serviceKey
    ? createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : supabaseAuth;

  return { supabaseAuth, supabase, user };
}

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = getSupabaseAuthUrl();
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Return a proxy or a dummy client that fails gracefully, but here we 
    // want to avoid a 500. Next.js will likely crash anyway if we use this client
    // without a URL, so we throw a descriptive error or return null.
    // In many cases, returning null and letting the component handle it is safer.
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.");
  }

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    },
  );
}

