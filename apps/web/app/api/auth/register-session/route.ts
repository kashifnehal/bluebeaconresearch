import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { isDeviceLimitEnabled } from "@/lib/flags";
import {
  MAX_SESSIONS_PER_USER,
  decodeSessionIdClaim,
  deriveDeviceLabel,
  oldestSessionToEvict,
  selectStaleSessionIds,
  type SessionRow,
} from "@/lib/session-tracking";

// POST /api/auth/register-session — called right after a successful login
// (password sign-in on the client, Google OAuth server-side in
// auth/callback/route.ts) to record the new session and enforce the
// MAX_SESSIONS_PER_USER cap. See lib/session-tracking.ts for the cap logic
// and its documented lazy-enforcement (~1hr worst case) limitation.
export async function POST(req: NextRequest) {
  const clients = await getRouteSupabaseClients();
  if (!clients) return NextResponse.json({ ok: false }, { status: 503 });

  const { supabaseAuth, supabase, user } = clients;
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const {
    data: { session },
  } = await supabaseAuth.auth.getSession();
  const sessionId = session ? decodeSessionIdClaim(session.access_token) : null;
  if (!sessionId) {
    // Nothing usable to record — not the caller's problem, don't block login.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const deviceLabel = deriveDeviceLabel(req.headers.get("user-agent"));

  const { data: existing } = await supabase
    .from("user_sessions")
    .select("id, created_at, last_seen_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const rows: SessionRow[] = existing ?? [];

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
      // Row-only eviction — see the limitation comment in session-tracking.ts.
      await supabase.from("user_sessions").delete().eq("id", toEvict.id);
    }
  }

  await supabase.from("user_sessions").insert({
    user_id: user.id,
    session_id: sessionId,
    device_label: deviceLabel,
  });

  return NextResponse.json({ ok: true });
}
