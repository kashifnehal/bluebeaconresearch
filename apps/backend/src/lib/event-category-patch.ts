// Cross-source merge branches in signal-merge.ts never wrote event_category on an
// update (see docs/claude_project/R3_EVENT_CATEGORY_COVERAGE.md cause #2) — a signal
// whose first insert landed null (heuristic fallback, or pre-migration) stayed null
// forever even after a later, real Claude classification arrived. This only fills a
// null; it never overwrites a category an earlier classification already set.
export function buildEventCategoryPatch(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): { event_category?: string } {
  if (existing !== null && existing !== undefined) return {};
  if (typeof incoming !== "string" || incoming.length === 0) return {};
  return { event_category: incoming };
}
