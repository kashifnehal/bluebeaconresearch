import { createServerClient } from "@supabase/ssr";
import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { track as trackVercelAnalyticsServer } from "@vercel/analytics/server";
import { isProjectReady, isDeviceLimitEnabled } from "@/lib/flags";
import { getSupabaseAuthUrl } from "@/lib/supabase-auth-url";
import {
  MAX_SESSIONS_PER_USER,
  decodeSessionIdClaim,
  deriveDeviceLabel,
  oldestSessionToEvict,
  selectStaleSessionIds,
  type SessionRow,
} from "@/lib/session-tracking";

// Minimal funnel tracking (2026-08-27) -- signup_completed, fired once per
// user. This route also handles every subsequent Google OAuth *login*, not
// just the first-ever signup, so the once-per-user dedup here is load
// bearing, not just a nicety: without it every login would look like a
// repeat signup. Check-then-insert against `supabase` (RLS-scoped to this
// session, since this route has no service-role client of its own) plus the
// partial unique index in supabase/migrations/013_events_table.sql as the
// race-condition backstop -- same pattern as apps/web/app/api/events/route.ts.
// Deferred via after() (Part 3b) so it runs once the redirect has already
// been sent -- it's instrumentation, not part of getting the user to the
// next page.
async function trackSignupCompletedOnce(supabase: SupabaseClient, userId: string) {
  try {
    const { data: existingEvent } = await supabase
      .from("events")
      .select("id")
      .eq("user_id", userId)
      .eq("event_type", "signup_completed")
      .limit(1);
    if (!existingEvent || existingEvent.length === 0) {
      const { error: insertEventError } = await supabase.from("events").insert({
        user_id: userId,
        event_type: "signup_completed",
        metadata: { source: "oauth_callback" },
      });
      // 23505 = already logged by a near-simultaneous request -- expected, not
      // an error (see api/events/route.ts for the same reasoning).
      if (!insertEventError || insertEventError.code === "23505") {
        await trackVercelAnalyticsServer("signup_completed", { source: "oauth_callback" });
      }
    }
  } catch {
    // Instrumentation must never block or fail the auth callback.
  }
}

// Session-cap bookkeeping (max MAX_SESSIONS_PER_USER concurrent logins) — see
// lib/session-tracking.ts for the eviction rule and its documented
// lazy-enforcement (~1hr worst case) limitation. Deferred via after() (Part
// 3b), same reasoning as trackSignupCompletedOnce above.
async function recordSessionBookkeeping(
  supabase: SupabaseClient,
  userId: string,
  userAgent: string | null,
) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const sessionId = session ? decodeSessionIdClaim(session.access_token) : null;
    if (!sessionId) return;
    const deviceLabel = deriveDeviceLabel(userAgent);
    const { data: existingSessions } = await supabase
      .from("user_sessions")
      .select("id, created_at, last_seen_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    const rows: SessionRow[] = existingSessions ?? [];

    const staleIds = selectStaleSessionIds(rows, new Date());
    if (staleIds.length > 0) {
      await supabase.from("user_sessions").delete().in("id", staleIds);
    }
    const remaining = rows.filter((r) => !staleIds.includes(r.id));

    // Two-device limit is parked (founder decision 2026-09-28). Set
    // DEVICE_LIMIT_ENABLED=true in Vercel and redeploy to enable.
    if (isDeviceLimitEnabled) {
      const toEvict = oldestSessionToEvict(remaining, MAX_SESSIONS_PER_USER);
      if (toEvict) {
        await supabase.from("user_sessions").delete().eq("id", toEvict.id);
      }
    }

    await supabase.from("user_sessions").insert({
      user_id: userId,
      session_id: sessionId,
      device_label: deviceLabel,
    });
  } catch {
    // Session tracking must never block or fail the auth callback.
  }
}

// Dependency-injection seam for tests (same pattern as
// app/api/signals/[id]/route.ts's SignalDetailDeps) — a real route.test.ts
// can't call GET() directly and still exercise a real PKCE exchange (no
// Supabase backend in a unit test) or next/server's after() (it throws
// outside a real request-handling context, see
// https://nextjs.org/docs/messages/next-dynamic-api-wrong-context).
export type AuthCallbackDeps = {
  createClient: (request: NextRequest, response: NextResponse) => SupabaseClient;
  after: (task: () => void | Promise<void>) => void;
  trackSignupCompletedOnce: typeof trackSignupCompletedOnce;
  recordSessionBookkeeping: typeof recordSessionBookkeeping;
};

const defaultAuthCallbackDeps: AuthCallbackDeps = {
  createClient: (request, response) =>
    createServerClient(getSupabaseAuthUrl()!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }),
  after,
  trackSignupCompletedOnce,
  recordSessionBookkeeping,
};

// This route has no dynamic segments, so Next's generated route-handler type
// check (next build, not plain tsc) requires the second parameter to match
// exactly `{ params: Promise<{}> }` if present at all — deps has to be a
// third parameter, not a repurposed second one.
export async function GET(
  request: NextRequest,
  _context: { params: Promise<Record<string, never>> } = { params: Promise.resolve({}) },
  deps: AuthCallbackDeps = defaultAuthCallbackDeps,
) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;
  // Forwarded from /login's "sign in and come back here" link (e.g. the
  // watchlist Follow toggle) — only trusted as a same-origin path, never an
  // absolute or protocol-relative URL.
  const redirectedFrom = url.searchParams.get("redirectedFrom");
  const isSafeRedirect = (p: string | null): p is string =>
    typeof p === "string" && p.startsWith("/") && !p.startsWith("//");

  // Handle OAuth error params forwarded by Supabase or Google
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    console.error("[OAuth Callback Error]", error, errorDescription);
    const msg = encodeURIComponent(errorDescription ?? error);
    return NextResponse.redirect(new URL(`/login?error=${msg}`, origin));
  }

  // No code at all (a malformed or replayed callback link) — same generic,
  // vendor-text-free message as a failed exchange below (Part 3c).
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=signin_failed", origin));
  }

  // We construct a single response object that captures cookies set by Supabase
  let targetPath = "/onboarding";

  const response = NextResponse.redirect(new URL(targetPath, origin));

  const supabase = deps.createClient(request, response);

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    // Log the real (vendor) error server-side only — GoTrue's message text
    // must never reach the user-facing redirect URL (rule: no vendor error
    // text in user-facing copy). See login/page.tsx's urlErrorMessage.
    console.error("[OAuth Code Exchange Error]", exchangeError.message);
    return NextResponse.redirect(new URL("/login?error=signin_failed", origin));
  }

  // Shortened chain (Part 3b): exchange the code, read onboarding status
  // once, redirect. signup_completed tracking and session-cap bookkeeping
  // used to run inline here, serially, before the user ever saw the next
  // page — now deferred via after() below, since neither is anything the
  // response depends on.
  let user: { id: string } | null = null;
  try {
    if (!isProjectReady) {
      targetPath = "/";
    } else {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      user = authUser;

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.onboarding_completed) {
          targetPath = isSafeRedirect(redirectedFrom) ? redirectedFrom : "/dashboard";
        }
      }
    }
  } catch {
    // ignore bootstrap errors
  }

  // Build final redirect response and copy over all session cookies
  const finalResponse = NextResponse.redirect(new URL(targetPath, origin));
  response.cookies.getAll().forEach((c) => {
    finalResponse.cookies.set(c.name, c.value, c);
  });

  // Fire-and-forget instrumentation, after the redirect has already gone out
  // — see trackSignupCompletedOnce/recordSessionBookkeeping above. Skipped
  // entirely (not deferred) when there's no user, same as the inline checks
  // they replaced.
  if (user) {
    const userId = user.id;
    const userAgent = request.headers.get("user-agent");
    deps.after(async () => {
      await deps.trackSignupCompletedOnce(supabase, userId);
      await deps.recordSessionBookkeeping(supabase, userId, userAgent);
    });
  }

  return finalResponse;
}


