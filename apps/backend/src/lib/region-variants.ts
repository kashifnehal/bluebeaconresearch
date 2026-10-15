// Mirrors the normalizeRegionKey mapping in apps/web/lib/signal-filters.ts
// (expandRegionVariants) so an alert_rules.regions entry written with an old
// label ("Middle East") matches a signals.region value written with the new
// one ("middle-east"), and vice versa. apps/backend does not depend on
// @blue-beacon-research/shared or apps/web — see the identical note on
// sortByRelevance in ./relevance-rank.ts — so this is a small duplicated
// mapping, not a new cross-app dependency. Do not add new synonyms here; a
// region label with no casing/hyphen variant of another falls through to
// exact string match, same as the old `.includes()` check.
function normalizeRegionKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

export function regionMatches(ruleRegions: string[], signalRegion: string): boolean {
  if (!signalRegion) return false;
  const signalKey = normalizeRegionKey(signalRegion);
  return ruleRegions.some((ruleRegion) => normalizeRegionKey(ruleRegion) === signalKey);
}
