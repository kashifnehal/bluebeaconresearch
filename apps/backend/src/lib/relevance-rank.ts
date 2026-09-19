/**
 * Recency+severity ranking for `sort=relevance` on GET /v1/signals (the
 * Fastify API-tier route — apps/backend/src/routes/signals.ts).
 *
 *   rank_score = severity / (hours_since_published + 2) ^ 1.8
 *
 * The `+2` floor keeps a just-published signal (hours_since ≈ 0) from
 * dividing by a near-zero base and swamping every older signal regardless of
 * severity; the 1.8 exponent makes the recency decay outweigh severity
 * within roughly a day or two.
 *
 * Canonical timestamp: this route's own `sort=newest` already orders by
 * `created_at` (not `event_date` — that field is only used for the `window`
 * filter here), so relevance ranks on `created_at` too, for consistency with
 * what "newest" already means on this route.
 *
 * Mirrored in apps/web/lib/signal-relevance-rank.ts for the Next.js BFF route
 * that actually backs the web app's own pages (apps/web/app/api/signals/route.ts)
 * — kept as a small duplicated formula rather than a new cross-app
 * dependency, since apps/backend does not currently depend on
 * @blue-beacon-research/shared.
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

/** Stable descending sort by relevanceRankScore; does not mutate `items`. */
export function sortByRelevance<T>(
  items: T[],
  getSeverity: (item: T) => number,
  getTimestamp: (item: T) => string | null | undefined,
  now: Date = new Date(),
): T[] {
  return items
    .map((item, index) => ({ item, index, score: relevanceRankScore(getSeverity(item), getTimestamp(item), now) }))
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index))
    .map((r) => r.item);
}
