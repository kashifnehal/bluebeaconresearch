import { getCachedTotalSignalCount } from "./signal-count-cache";

/** Fallback window if the shared signal-count cache's own DB read fails. BBR working value, no published source. */
export const HOMEPAGE_STATS_TTL_MS = 5 * 60 * 1000;

type HomepageCountCache = { count: number; storedAt: number };

let homepageCountCache: HomepageCountCache | null = null;

export function resetHomepageStatsCacheForTests(): void {
  homepageCountCache = null;
}

function cachedTotal(now: number): { totalSignals: number | null } {
  if (!homepageCountCache) return { totalSignals: null };
  if (now - homepageCountCache.storedAt >= HOMEPAGE_STATS_TTL_MS) return { totalSignals: null };
  return { totalSignals: homepageCountCache.count };
}

export function cachedHomepageSignalCount(now: number = Date.now()): { totalSignals: number | null } {
  return cachedTotal(now);
}

export async function loadHomepageSignalCount(
  now: number = Date.now(),
  getCount: () => Promise<number> = getCachedTotalSignalCount,
): Promise<{ totalSignals: number | null }> {
  try {
    const count = await getCount();
    homepageCountCache = { count, storedAt: now };
    return { totalSignals: count };
  } catch (err) {
    // A thrown error (query failure, or an unusable 0/null count — see
    // signal-count-cache.ts) falls back to the last good in-process reading
    // rather than ever showing/caching a bad value.
    console.error("[getHomepageStats] count query failed:", err);
    return cachedTotal(now);
  }
}
