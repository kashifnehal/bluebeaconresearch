import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError, apiErrorLogged } from "@/lib/api-response";
import { rateLimitOrPass } from "@/lib/ratelimit";

// Minimal funnel-event log (2026-08-27) — see apps/web/lib/funnel-events.ts for the
// client-side caller and supabase/migrations/013_events_table.sql for the table/RLS.
// Only ever called for signup_completed, first_signal_viewed, and
// first_alert_rule_created (all `once: true`) — signup_started is Vercel-Analytics
// only and never reaches this route, since it fires before the auth user exists.

export type EventsPostDeps = {
  getClients: typeof getRouteSupabaseClients;
  // Key only. Callers must not pass a limit or window — those stay on
  // rateLimitOrPass's own defaults, the same preset GET /api/signals uses.
  rateLimit: (key: string) => Promise<{ success: boolean }>;
};

export async function POST(req: NextRequest, override?: Partial<EventsPostDeps>) {
  // Next.js also passes a route context as the second argument. Only treat it
  // as test deps when the limiter or client functions are actually present.
  const getClients =
    override && typeof override.getClients === "function" ? override.getClients : getRouteSupabaseClients;
  const rateLimit =
    override && typeof override.rateLimit === "function"
      ? override.rateLimit
      : (key: string) => rateLimitOrPass(key);

  const clients = await getClients();
  if (!clients) {
    return apiError(500, "config_error");
  }
  const { supabase, user } = clients;
  if (!user) {
    return apiError(401, "unauthorized");
  }

  // After the session check, before any events read or insert.
  // Same preset as GET /api/signals: a key-only rateLimitOrPass call, so this
  // route uses that function's existing defaults and does not set its own limit.
  // Keyed by the signed-in user id.
  try {
    const rl = await rateLimit(`events:${user.id}`);
    if (!rl.success) {
      return apiError(429, "rate_limited");
    }
  } catch (err) {
    console.warn("[events] rate limit check failed, continuing:", err);
  }

  let body: { eventType?: unknown; metadata?: unknown; once?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError(400, "invalid_body");
  }

  const eventType = body?.eventType;
  if (typeof eventType !== "string" || eventType.length === 0) {
    return apiError(400, "missing_event_type");
  }
  const metadata =
    body?.metadata && typeof body.metadata === "object" ? (body.metadata as Record<string, unknown>) : null;

  if (body?.once) {
    // This client prefers service-role (bypasses RLS) per getRouteSupabaseClients()'s
    // contract; if service-role isn't configured it falls back to the RLS-scoped
    // session client, which has no SELECT policy on `events` (service-role-only
    // reads — see the migration). In that fallback case this check always sees zero
    // rows, and the partial unique index below is what actually enforces "once".
    const { data: existing, error: selectError } = await supabase
      .from("events")
      .select("id")
      .eq("user_id", user.id)
      .eq("event_type", eventType)
      .limit(1);

    if (selectError) {
      return apiErrorLogged(500, "db_error", selectError);
    }
    if (existing && existing.length > 0) {
      return NextResponse.json({ inserted: false });
    }
  }

  const { error: insertError } = await supabase.from("events").insert({
    user_id: user.id,
    event_type: eventType,
    metadata,
  });

  if (insertError) {
    // 23505 = unique_violation — expected/benign on a once-per-user event when two
    // near-simultaneous requests both passed the check above (or the fallback path
    // above never checked at all). Either way the event ends up recorded exactly
    // once, which is the desired outcome, not a real error.
    if (insertError.code === "23505") {
      return NextResponse.json({ inserted: false });
    }
    return apiErrorLogged(500, "db_error", insertError);
  }

  return NextResponse.json({ inserted: true });
}
