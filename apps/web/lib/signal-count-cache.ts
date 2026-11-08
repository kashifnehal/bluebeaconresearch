import { unstable_cache } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export type SignalCountClient = {
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => PromiseLike<{ count: number | null; error: unknown }>;
  };
};

/**
 * Built from env vars only (no `cookies()`), so it can run inside an
 * `unstable_cache` scope — Next does not allow reading cookies/headers
 * inside a cached function. Prefers the service-role key (bypasses RLS) the
 * same way apps/web/lib/supabase-server.ts's getRouteSupabaseClients() does;
 * falls back to the anon key, which RLS reduces to a count of 0.
 */
export function buildSignalCountClient(): SignalCountClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return null;
  return createServiceClient(supabaseUrl, key, { auth: { persistSession: false } });
}

/**
 * Throws on a query error or an unusable count instead of returning null, so
 * neither Next's data cache nor a caller's own stale-value fallback ever
 * stores a 0/null as if it were a real reading. 0 here means RLS hid every
 * row (anon key, no session), not a genuinely empty signals table.
 */
export async function fetchTotalSignalCountOrThrow(client: SignalCountClient): Promise<number> {
  const { count, error } = await client.from("signals").select("id", { count: "exact", head: true });
  if (error) throw error;
  if (count == null || count === 0) throw new Error("unusable signal count (0 or null)");
  return count;
}

async function fetchTotalSignalCountFromEnv(): Promise<number> {
  const client = buildSignalCountClient();
  if (!client) throw new Error("signal count: supabase not configured");
  return fetchTotalSignalCountOrThrow(client);
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
