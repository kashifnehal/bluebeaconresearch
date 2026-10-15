/**
 * Helpers for the dashboard ingestion box. `budgetClosed` stays on each collector
 * in GET /api/ingestion/status. When every collector is closed, the box still
 * shows the live state and the newest stored article time (2026-10-16).
 */

export type CollectorBudgetSnapshot = {
  budgetClosed?: boolean;
};

/** True only when there is at least one collector and each has budgetClosed === true. A missing field is not closed. */
export function allCollectorsBudgetClosed(
  collectors: Record<string, CollectorBudgetSnapshot | null | undefined> | null | undefined,
): boolean {
  if (!collectors || typeof collectors !== "object") return false;
  const entries = Object.values(collectors);
  if (entries.length === 0) return false;
  return entries.every((collector) => collector != null && collector.budgetClosed === true);
}

/**
 * ISO time of the newest stored article, when the status payload already
 * includes one. lastFetchedAt is the collector cycle clock, including a cycle
 * that stored nothing, so it is not used here.
 */
export function newestStoredArticleIso(
  status: { newestStoredArticleAt?: unknown } | null | undefined,
): string | null {
  const value = status?.newestStoredArticleAt;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (Number.isNaN(new Date(trimmed).getTime())) return null;
  return trimmed;
}
