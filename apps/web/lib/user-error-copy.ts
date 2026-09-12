/**
 * User-facing error copy for #138 Phase 2.
 * Technical strings stay in console.error only — never toast or rendered text.
 * Tone matches NotificationPanel's "Couldn't load alerts right now — this is a
 * fetch error, not 'no alerts yet.'"
 */

export const SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL = "Supabase client not available";

export const ACCOUNT_CONNECT_ERROR =
  "We couldn't connect to your account right now — please refresh and try again.";

export const ACCURACY_LOAD_ERROR =
  "We couldn't load the accuracy data right now — please try again shortly.";

export const METRICS_LOAD_ERROR =
  "We couldn't load usage metrics right now — please try again shortly.";

/**
 * Shown when /api/ingestion/status is in degraded mode (no Redis pipeline:last_run).
 * Assumes transience without verifying it: the payload has no last-healthy
 * timestamp for the health feed itself. lastFetchedAt in that mode is newest
 * raw_events.created_at, not how long per-collector health has been unknown.
 */
export const COLLECTOR_HEALTH_UNAVAILABLE =
  "Per-collector health is temporarily unavailable.";

export function throwIfNoSupabase<T>(client: T | null): T {
  if (!client) {
    console.error(SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL);
    throw new Error(ACCOUNT_CONNECT_ERROR);
  }
  return client;
}
