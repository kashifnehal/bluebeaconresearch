import { unstable_cache } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { HOMEPAGE_DB_TIMEOUT_MS } from "./with-timeout";

export type SignalCountClient = {
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => {
      abortSignal: (signal: AbortSignal) => PromiseLike<{ count: number | null; error: unknown }>;
    };
  };
};

/**
 * Built from env vars only (no `cookies()`), so it can run inside an
 * `unstable_cache` scope — Next does not allow reading cookies/headers
 * inside a cached function. Service-role key only (SUPABASE_SERVICE_ROLE_KEY
 * or SUPABASE_SECRET_KEY, same precedence as apps/web/lib/supabase-server.ts's
 * getRouteSupabaseClients()) — no anon-key fallback. The anon key is always
 * set in production (the client bundle needs it), so a fallback to it meant
 * this never actually returned null when the server key was missing: it
 * silently read with RLS applied instead, which returns a count of 0 that
 * fetchTotalSignalCountOrThrow then has to special-case as "unusable" rather
 * than this function ever reporting "not configured" (2026-11-17).
 */
export function buildSignalCountClient(): SignalCountClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[signal-count-cache] supabase not configured (missing URL or service-role key)");
    return null;
  }
  return createServiceClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
}

/**
 * Throws on a query error or an unusable count instead of returning null, so
 * neither Next's data cache nor a caller's own stale-value fallback ever
 * stores a 0/null as if it were a real reading. 0 here means RLS hid every
 * row (anon key, no session), not a genuinely empty signals table.
 *
 * `.abortSignal(AbortSignal.timeout(timeoutMs))` genuinely cancels the
 * underlying request at the HTTP layer — unlike lib/with-timeout.ts's
 * withTimeoutOrFallback() (already wrapping this call's caller at the
 * page-render level), which only stops the page from *waiting* on a hung
 * promise; the request itself kept running in the background, which is why
 * Vercel still logged "Task timed out after 300 seconds" for this route
 * well after that page-level wrap shipped (2026-11-16). This is the actual
 * fix for that: the request itself now dies at `timeoutMs`, so nothing is
 * left running when the function returns.
 */
export async function fetchTotalSignalCountOrThrow(
  client: SignalCountClient,
  timeoutMs: number = HOMEPAGE_DB_TIMEOUT_MS,
): Promise<number> {
  const { count, error } = await client
    .from("signals")
    .select("id", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(timeoutMs));
  if (error) throw error;
  if (count == null || count === 0) throw new Error("unusable signal count (0 or null)");
  return count;
}

async function fetchTotalSignalCountFromEnv(): Promise<number> {
  const client = buildSignalCountClient();
  if (!client) throw new Error("signal count: supabase not configured");
  try {
    return await fetchTotalSignalCountOrThrow(client);
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    const reason = timedOut
      ? `timed out after ${HOMEPAGE_DB_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message || err.name
        : String(err);
    console.error(`[signal-count-cache] total-signal-count query failed: ${reason}`);
    throw err;
  }
}

/**
 * Wires a count-fetching function into a revalidating cache. Production uses
 * the real `unstable_cache` (the default); tests pass a fake `wrapImpl` that
 * mimics the same once-per-window contract without requiring Next's request
 * runtime, which `unstable_cache` depends on.
 */
export function createTotalSignalCountCache(
  fetchImpl: () => Promise<number> = fetchTotalSignalCountFromEnv,
  wrapImpl: typeof unstable_cache = unstable_cache,
): () => Promise<number> {
  return wrapImpl(fetchImpl, ["total-signal-count"], { revalidate: 600, tags: ["signal-count"] });
}

/**
 * Shared by the homepage and how-it-works stats bar — both need the same
 * single, unfiltered `signals` row count. Backed by Next's data cache
 * (600s, tag "signal-count") instead of a per-instance module variable, so
 * every serverless instance reuses one Postgres read instead of each
 * instance running its own every 600s. This exact query (`select id from
 * signals`, exact count, no filter) was the largest single entry in
 * pg_stat_statements, 2026-11-09: 9,422 calls, 2,181s total.
 */
export const getCachedTotalSignalCount = createTotalSignalCountCache();
