// Concurrent-session cap (#232-class request: "limit to 2 devices"). Enforced
// opportunistically at login, not by a background job or realtime hook.
//
// Known limitation, not a bug: evicting a session here only deletes its
// user_sessions row — it cannot revoke the JWT that session is already
// holding. BBR never stores raw access/refresh tokens server-side (only this
// bookkeeping row), so there is no token here to call auth.admin.signOut()
// with. Supabase's GoTrue validates access tokens locally (signature + exp)
// without a revocation check on every request, so an evicted session keeps
// working until its short-lived access token naturally expires — 1 hour by
// default in this project — and only loses access once it tries to refresh.
// That worst case (~1hr) is an accepted, documented Supabase behavior, not
// something this table can shorten.
export const MAX_SESSIONS_PER_USER = 2;
export const STALE_SESSION_DAYS = 30;

export type SessionRow = {
  id: string;
  created_at: string;
  last_seen_at: string;
};

/**
 * Decodes the `session_id` claim from a Supabase JWT's payload. Not signature
 * verification — the token already passed GoTrue's own verification (via
 * supabase.auth.getSession()/getUser()) before this ever runs; this only reads
 * a claim already-trusted, it does not establish trust itself.
 */
export function decodeSessionIdClaim(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

/**
 * Lightweight "Chrome on Windows"-style label from a User-Agent string.
 * Heuristic, not a full UA parser — good enough for a device list, not for
 * bot detection or analytics.
 */
export function deriveDeviceLabel(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;

  let browser = "Unknown browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/CriOS\//.test(ua)) browser = "Chrome";
  else if (/FxiOS\//.test(ua)) browser = "Firefox";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";

  let os = "Unknown OS";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Linux/.test(ua)) os = "Linux";

  return `${browser} on ${os}`;
}

/**
 * Returns the single oldest session to evict, or null if the user is under
 * the cap. Deletes exactly one row per call (matches the spec: check-and-evict
 * happens once per login, not a loop down to the limit) — a count that's
 * somehow above the cap self-corrects over successive logins rather than in
 * one shot.
 */
export function oldestSessionToEvict(
  existingSessionsAscByCreatedAt: SessionRow[],
  maxSessions: number = MAX_SESSIONS_PER_USER,
): SessionRow | null {
  if (existingSessionsAscByCreatedAt.length < maxSessions) return null;
  return existingSessionsAscByCreatedAt[0] ?? null;
}

/** Ids of rows whose last_seen_at is older than STALE_SESSION_DAYS from `now`. */
export function selectStaleSessionIds(
  sessions: SessionRow[],
  now: Date,
  staleDays: number = STALE_SESSION_DAYS,
): string[] {
  const cutoff = now.getTime() - staleDays * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => new Date(s.last_seen_at).getTime() < cutoff).map((s) => s.id);
}
