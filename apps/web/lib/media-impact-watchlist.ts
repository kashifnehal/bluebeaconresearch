// #142 — process-local caveat lookup for the [Media-Impact] tag.
// Same 10-minute in-memory TTL the backend watchlist reader uses. The table
// is public-read reference data (RLS using (true)), not user data.

const CACHE_TTL_MS = 10 * 60 * 1000;

type CaveatCache = {
  expiresAt: number;
  byName: Map<string, string>;
};

let cache: CaveatCache | null = null;

export function shortMediaImpactCaveat(caveat: string): string {
  const trimmed = String(caveat ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const sentenceEnd = trimmed.search(/(?<=[.!?])\s+/);
  const first = sentenceEnd === -1 ? trimmed : trimmed.slice(0, sentenceEnd + 1);
  if (first.length <= 180) return first.trim();
  return `${first.slice(0, 177).trimEnd()}…`;
}

export function setMediaImpactCaveatCacheForTests(
  byName: Map<string, string> | null,
): void {
  cache = byName
    ? { expiresAt: Date.now() + CACHE_TTL_MS, byName }
    : null;
}

export async function loadMediaImpactCaveats(
  supabase: { from: (table: string) => any },
): Promise<Map<string, string>> {
  if (cache && Date.now() < cache.expiresAt) return cache.byName;
  try {
    const { data, error } = await supabase
      .from("media_impact_watchlist")
      .select("entity_name, caveat")
      .eq("active", true);
    if (error) throw error;
    const byName = new Map<string, string>();
    for (const row of data ?? []) {
      if (!row.entity_name) continue;
      byName.set(row.entity_name, shortMediaImpactCaveat(row.caveat ?? ""));
    }
    cache = { expiresAt: Date.now() + CACHE_TTL_MS, byName };
    return byName;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[media-impact-watchlist] caveat fetch failed (${reason});`,
      cache ? "serving stale cache" : "no caveats",
    );
    return cache?.byName ?? new Map();
  }
}
