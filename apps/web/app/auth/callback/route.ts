import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { track as trackVercelAnalyticsServer } from "@vercel/analytics/server";
import { isProjectReady } from "@/lib/flags";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  // Handle OAuth error params forwarded by Supabase or Google
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    console.error("[OAuth Callback Error]", error, errorDescription);
    const msg = encodeURIComponent(errorDescription ?? error);
    return NextResponse.redirect(new URL(`/login?error=${msg}`, origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=No+auth+code+received", origin));
  }

  // We construct a single response object that captures cookies set by Supabase
  let targetPath = "/onboarding";

  const response = NextResponse.redirect(new URL(targetPath, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[OAuth Code Exchange Error]", exchangeError.message);
    const msg = encodeURIComponent(exchangeError.message);
    return NextResponse.redirect(new URL(`/login?error=${msg}`, origin));
  }

  // Check onboarding status — same destination logic as resolvePostAuthRedirect()
  // (lib/profile.ts), used by every other post-auth flow (login, password reset,
  // signup confirmation). OAuth gives a session synchronously with no confirmation
  // step, so there's no "check your email" branch here — just onboarding/dashboard,
  // gated the same way as everywhere else.
  try {
    if (!isProjectReady) {
      targetPath = "/";
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.onboarding_completed) {
          targetPath = "/dashboard";
        }

        // Minimal funnel tracking (2026-08-27) -- signup_completed, fired once per
        // user. This route also handles every subsequent Google OAuth *login*, not
        // just the first-ever signup, so the once-per-user dedup here is load
        // bearing, not just a nicety: without it every login would look like a
        // repeat signup. Check-then-insert against `supabase` (RLS-scoped to this
        // session, since this route has no service-role client of its own) plus the
        // partial unique index in supabase/migrations/013_events_table.sql as the
        // race-condition backstop -- same pattern as apps/web/app/api/events/route.ts,
        // done inline here since this is a server redirect handler, not a fetch-able
        // client context.
        try {
          const { data: existingEvent } = await supabase
            .from("events")
            .select("id")
            .eq("user_id", user.id)
            .eq("event_type", "signup_completed")
            .limit(1);
          if (!existingEvent || existingEvent.length === 0) {
            const { error: insertEventError } = await supabase.from("events").insert({
              user_id: user.id,
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
    }
  } catch {
    // ignore bootstrap errors
  }

  // Build final redirect response and copy over all session cookies
  const finalResponse = NextResponse.redirect(new URL(targetPath, origin));
  response.cookies.getAll().forEach((c) => {
    finalResponse.cookies.set(c.name, c.value, c);
  });

  return finalResponse;
}


