/**
 * User-facing error copy (#138).
 * Technical strings stay in console.error only — never toast or rendered text.
 * Tone matches NotificationPanel's "Couldn't load alerts right now — this is a
 * fetch error, not 'no alerts yet.'"
 */

export const SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL = "Supabase client not available";
export const MISSING_SUPABASE_ENV_TECHNICAL = "Missing Supabase env vars.";

export const ACCOUNT_CONNECT_ERROR =
  "We couldn't connect to your account right now — please refresh and try again.";

export const AUTH_SESSION_ERROR = "Sign in again and try that again.";

export const SETTINGS_SAVE_ERROR =
  "We couldn't save that change — please try again shortly.";

export const ACCURACY_LOAD_ERROR =
  "We couldn't load the accuracy data right now — please try again shortly.";

export const METRICS_LOAD_ERROR =
  "We couldn't load usage metrics right now — please try again shortly.";

export const GENERIC_REQUEST_ERROR =
  "We couldn't complete that request — please try again shortly.";

export const SERVICE_HEALTH_LOAD_ERROR =
  "We couldn't load service health right now — please try again shortly.";

export const DISCORD_TEST_UNREACHABLE =
  "We couldn't reach Discord with that webhook — check the URL and try again.";

/**
 * Shown when /api/ingestion/status is in degraded mode (no Redis pipeline:last_run).
 * Assumes transience without verifying it: the payload has no last-healthy
 * timestamp for the health feed itself. lastFetchedAt in that mode is newest
 * raw_events.created_at, not how long per-collector health has been unknown.
 */
export const COLLECTOR_HEALTH_UNAVAILABLE =
  "Per-collector health is temporarily unavailable.";

/**
 * Dashboard/map cached-feed banner. `fallbackReason` is an internal code
 * (rate-limit, db-error, handler-exception) — never interpolate it.
 */
export const FEED_DEGRADED_COPY =
  "The signal feed couldn't refresh — showing the last available data.";

const TECHNICAL_FRAGMENTS = [
  SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL,
  MISSING_SUPABASE_ENV_TECHNICAL,
  "NEXT_PUBLIC_SUPABASE",
  "Missing API_URL",
];

const ALLOWED_MUTATION_MESSAGES = new Set([
  ACCOUNT_CONNECT_ERROR,
  AUTH_SESSION_ERROR,
  SETTINGS_SAVE_ERROR,
  "Severity must be between 1 and 10",
  "Please check your alert rule settings and try again",
]);

export function isTechnicalClientMessage(message: string): boolean {
  return TECHNICAL_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/** Auth catch: keep GoTrue messages the user can act on; rewrite env/client leaks. */
export function userFacingCaughtError(err: unknown, fallback: string): string {
  if (err instanceof Error && isTechnicalClientMessage(err.message)) {
    console.error(err.message);
    return ACCOUNT_CONNECT_ERROR;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/** Settings / Discord / alert-rule catches: never pass PostgREST through. */
export function safeMutationError(err: unknown, fallback: string): string {
  if (err instanceof Error && ALLOWED_MUTATION_MESSAGES.has(err.message)) {
    return err.message;
  }
  if (err instanceof Error && isTechnicalClientMessage(err.message)) {
    console.error(err.message);
    return ACCOUNT_CONNECT_ERROR;
  }
  console.error(err);
  return fallback;
}

export function feedDegradedCopy(_reason?: string | null): string {
  return FEED_DEGRADED_COPY;
}

export function throwIfNoSupabase<T>(client: T | null): T {
  if (!client) {
    console.error(SUPABASE_CLIENT_UNAVAILABLE_TECHNICAL);
    throw new Error(ACCOUNT_CONNECT_ERROR);
  }
  return client;
}
