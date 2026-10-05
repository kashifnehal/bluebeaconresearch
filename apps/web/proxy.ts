import { createServerClient } from "@supabase/ssr";
import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type User,
  type UserResponse,
} from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isProjectReady } from "@/lib/flags";
import { getSupabaseAuthUrl } from "@/lib/supabase-auth-url";

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
// /api/prices/history, /api/prices/history-5y, /api/backtesting, /api/ingestion/status) are explicit
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
  "/help",
  // /map was missing from this list even though its data (/api/signals) has
  // always required an authenticated session — logged-out visitors could load
  // the page shell but every filter showed "0 total" with no indication why.
  "/map",
  "/archive",
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
//      2026-09-09 incident). 8s: a real GET /user took 6.4s and succeeded in
//      that incident; 3s sat inside normal tail latency.
//
// W7-AUTH-RESILIENCE (2026-10): a timeout, or any getUser() error, used to be
// treated identically to "no session" and redirect to /login — signing a
// real user out on a database hiccup (504 AuthRetryableFetchError, 409 "too
// many concurrent token refresh requests"). Now only a definite no-session
// result fails closed; a retryable failure falls open *if* the request still
// carries a Supabase auth cookie (see classifyAuthFailure / runAuthCheck
// below), since that cookie is the only evidence available that this was a
// real session and not a logged-out visitor.
const AUTH_CHECK_TIMEOUT_MS = 8000;
const AUTH_CHECK_TIMEOUT = { timedOut: true } as const;

export type AuthCheckOutcome = "ok" | "no-session" | "retryable";

// GoTrue error codes that mean "this JWT/session is definitely invalid," as
// opposed to "GoTrue failed to answer." session_not_found normally already
// arrives as AuthSessionMissingError (see isAuthSessionMissingError below),
// but auth-js documents it as a code on AuthApiError too — covered here in
// case a future GoTrue response path surfaces it that way.
const NO_SESSION_CODES = new Set(["bad_jwt", "session_not_found"]);

// Distinguishes "the user has no valid session" from "Supabase Auth itself
// is failing right now." Only the former should sign a user out.
export function classifyAuthFailure(err: unknown): "no-session" | "retryable" {
  if (isAuthSessionMissingError(err)) return "no-session";
  if (isAuthApiError(err)) {
    if (err.status === 401 || err.status === 403) return "no-session";
    if (err.code && NO_SESSION_CODES.has(err.code)) return "no-session";
    // Other AuthApiError statuses (429 rate-limited, 409 concurrent-refresh,
    // 5xx) are GoTrue-side failures, not evidence the user is logged out.
    return "retryable";
  }
  if (isAuthRetryableFetchError(err)) return "retryable";
  // Anything auth-js hasn't classified (a raw network failure that reached
  // here unwrapped, an unexpected shape) is not proof of "no session"
  // either — fail open to retryable rather than closed to no-session.
  return "retryable";
}

// @supabase/ssr's default cookie name is `sb-<project-ref>-auth-token`,
// chunked into `.0`, `.1`, ... when the session is large. Presence (not
// validity — we couldn't validate it, that's the whole problem) is the only
// signal available that this request belongs to a previously real session.
const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-.+-auth-token(\.\d+)?$/;

export function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => SUPABASE_AUTH_COOKIE_PATTERN.test(name));
}

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

// Races a live getUser() call against a timer and classifies the result.
// Takes the promise itself (rather than a Supabase client) so tests can pass
// a controlled promise instead of hitting a real auth backend.
export async function runAuthCheck(
  getUserPromise: Promise<UserResponse>,
  timeoutMs: number = AUTH_CHECK_TIMEOUT_MS,
): Promise<{ outcome: AuthCheckOutcome; user: User | null }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const authCheckStartedAt = Date.now();
  try {
    const result = await Promise.race([
      getUserPromise,
      new Promise<typeof AUTH_CHECK_TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(AUTH_CHECK_TIMEOUT), timeoutMs);
      }),
    ]);
    if ("timedOut" in result) {
      console.warn("Middleware auth check timed out:", {
        elapsedMs: Date.now() - authCheckStartedAt,
      });
      // Let getUser() finish in the background; swallow a later rejection so
      // it does not become an unhandled promise.
      void getUserPromise.catch((err: unknown) => {
        logAuthCheckError(err, "background");
      });
      return { outcome: "retryable", user: null };
    }
    if (result.error) throw result.error;
    if (!result.data.user) return { outcome: "no-session", user: null };
    return { outcome: "ok", user: result.data.user };
  } catch (err: unknown) {
    logAuthCheckError(err, "failed");
    return { outcome: classifyAuthFailure(err), user: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type AuthAction = "allow" | "allow-degraded" | "redirect";

// The full decision matrix: a definite no-session always redirects; a
// retryable failure (including a timeout, which runAuthCheck already maps
// to "retryable") only falls open when the request still carries a
// Supabase auth cookie — otherwise there is nothing to fail open *to*.
export function decideAuthAction(
  outcome: AuthCheckOutcome,
  hasAuthCookie: boolean,
): AuthAction {
  if (outcome === "ok") return "allow";
  if (outcome === "retryable" && hasAuthCookie) return "allow-degraded";
  return "redirect";
}

export async function proxy(request: NextRequest) {
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

  const supabaseUrl = getSupabaseAuthUrl();
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
  const { outcome } = await runAuthCheck(supabase.auth.getUser());
  const action = decideAuthAction(outcome, hasSupabaseAuthCookie(request));

  if (action === "allow") {
    return response;
  }

  if (action === "allow-degraded") {
    // Supabase Auth is degraded, not this user's session. We cannot verify
    // the cookie, but we also have no evidence it's invalid — fail open and
    // let the page render, flagged as degraded. Any data the page needs
    // still goes through /api/*, which authenticates independently and
    // fails closed on its own, so this does not widen what an unverified
    // visitor can actually read.
    response.headers.set("x-bbr-auth-degraded", "1");
    return response;
  }

  // action === "redirect": "no-session" (definite), or "retryable" with no
  // auth cookie at all — either way nothing here indicates a real
  // logged-in user.
  const loginUrl = new URL("/login", request.url);
  if (outcome === "retryable") {
    loginUrl.searchParams.set(
      "error",
      "Authentication is temporarily unavailable. Please try again in a moment.",
    );
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
