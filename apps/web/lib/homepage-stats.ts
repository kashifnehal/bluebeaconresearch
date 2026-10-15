/** BBR working value. No published source. */
export const HOMEPAGE_STATS_TTL_MS = 5 * 60 * 1000;

type HomepageCountCache = { count: number; storedAt: number };

let homepageCountCache: HomepageCountCache | null = null;

export function resetHomepageStatsCacheForTests(): void {
  homepageCountCache = null;
}

type HomepageCountResult = { count: number | null; error: unknown };

export type HomepageCountClient = {
  from: (table: string) => {
    select: (columns: string, options: { count: "exact"; head: true }) => PromiseLike<HomepageCountResult>;
  };
};

function cachedTotal(now: number): { totalSignals: number | null } {
  if (!homepageCountCache) return { totalSignals: null };
  if (now - homepageCountCache.storedAt >= HOMEPAGE_STATS_TTL_MS) return { totalSignals: null };
  return { totalSignals: homepageCountCache.count };
}

export function cachedHomepageSignalCount(now: number = Date.now()): { totalSignals: number | null } {
  return cachedTotal(now);
}

export async function loadHomepageSignalCount(
  supabase: HomepageCountClient,
  now: number = Date.now(),
): Promise<{ totalSignals: number | null }> {
  try {
    const { count, error } = await supabase.from("signals").select("id", { count: "exact", head: true });

    // 0 from the anon fallback is RLS hiding every row, not an empty table.
    if (error || count == null || count === 0) {
      console.error("[getHomepageStats] count query returned no usable count:", { error, count });
      return cachedTotal(now);
    }
    homepageCountCache = { count, storedAt: now };
    return { totalSignals: count };
  } catch (err) {
    console.error("[getHomepageStats] count query threw:", err);
    return cachedTotal(now);
  }
}
