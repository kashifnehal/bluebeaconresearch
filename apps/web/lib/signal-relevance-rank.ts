/**
 * Recency+severity ranking for `sort=relevance` on GET /api/signals (used by
 * the command palette's Signals search — see CommandPalette.tsx). Distinct
 * from `sort=newest` (pure recency) and `sort=severity` (pure severity): this
 * blends both, so a big, brand-new story can outrank an old, bigger one.
 *
 *   rank_score = severity / (hours_since_published + 2) ^ 1.8
 *
 * The `+2` floor keeps a just-published signal (hours_since ≈ 0) from
 * dividing by a near-zero base and swamping every older signal regardless of
 * severity; the 1.8 exponent makes the recency decay outweigh severity
 * within roughly a day or two, which is what "recency+severity" is asking for.
 *
 * Canonical timestamp: this route already treats `eventDate` (event_date,
 * falling back to the linked raw_event's date, then created_at — computed in
 * apps/web/app/api/signals/route.ts) as canonical for recency (`sort=newest`
 * orders by event_date first), so relevance ranks on the same field for
 * consistency.
 *
 * Mirrored in apps/backend/src/lib/relevance-rank.ts for the separate /v1
 * Fastify API-tier route (api.bluebeaconresearch.com) — kept as a small
 * duplicated formula rather than a new cross-app dependency, since
 * apps/backend does not currently depend on @blue-beacon-research/shared.
 */
export function relevanceRankScore(
  severity: number,
  referenceTimestamp: string | null | undefined,
  now: Date = new Date(),
): number {
  const refMs = referenceTimestamp ? new Date(referenceTimestamp).getTime() : NaN;
  const hoursSince = Number.isFinite(refMs) ? Math.max(0, (now.getTime() - refMs) / (1000 * 60 * 60)) : 0;
  return severity / Math.pow(hoursSince + 2, 1.8);
}

/**
 * Stable descending sort by relevanceRankScore; does not mutate `items`.
 *
 * `getId`, when provided, breaks an exact score tie by (eventDate DESC, id
 * ASC) instead of original array index — this is what lets a cursor-based
 * paginator (apps/web/app/api/signals/route.ts's default-view pagination)
 * reconstruct the *same* total order on a later request from just
 * (score, eventDate, id), since "whatever index it happened to have in this
 * particular fetch" isn't something a stateless cursor can encode. Callers
 * that don't paginate (e.g. the command palette's single-page search) can
 * omit it and keep the original index-stable behavior.
 */
export function sortByRelevance<T>(
  items: T[],
  getSeverity: (item: T) => number,
  getTimestamp: (item: T) => string | null | undefined,
  now: Date = new Date(),
  getId?: (item: T) => string,
): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      score: relevanceRankScore(getSeverity(item), getTimestamp(item), now),
      ts: getTimestamp(item),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (getId) {
        const at = a.ts ? new Date(a.ts).getTime() : 0;
        const bt = b.ts ? new Date(b.ts).getTime() : 0;
        if (bt !== at) return bt - at;
        const aid = getId(a.item);
        const bid = getId(b.item);
        return aid < bid ? -1 : aid > bid ? 1 : 0;
      }
      return a.index - b.index;
    })
    .map((r) => r.item);
}
