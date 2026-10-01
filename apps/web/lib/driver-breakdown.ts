// Pure helpers for the driver-breakdown route (app/api/signals/driver-breakdown/route.ts).
// Split out so the merge/de-duplicate logic — the part with an actual failure
// mode worth a unit test — doesn't need a live Supabase client to exercise.

export type DriverSignalRow = {
  id: string;
  event_date: string | null;
  created_at: string;
  event_category: string | null;
};

/**
 * Merge one or more paged row-sets into one, de-duplicated by signal id.
 *
 * A forex symbol's signals can be tagged in BOTH commodity_impacts and
 * currency_pair_impacts (verified 2026-10-01: EURUSD had 248 rows in the
 * former vs 39 in the latter), so the driver-breakdown route queries both
 * columns for a forex symbol and must count an overlapping signal once, not
 * twice. Commodity symbols pass a single row-set and this is a no-op merge.
 */
export function mergeSignalRows(...rowSets: DriverSignalRow[][]): DriverSignalRow[] {
  const byId = new Map<string, DriverSignalRow>();
  for (const rows of rowSets) {
    for (const row of rows) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }
  return Array.from(byId.values());
}

// Above this share of a window's signals being "Uncategorized", the note
// explaining why is worth showing — chosen so a couple of stray pre-#141
// rows in an otherwise well-classified window doesn't trigger it.
export const UNCATEGORIZED_NOTE_THRESHOLD = 0.8;

/**
 * Decide whether the driver-breakdown chart should show the note explaining
 * why signals show as "Uncategorized" (missing event_category data).
 */
export function shouldShowUncategorizedNote(total: number, uncategorizedTotal: number): boolean {
  return total > 0 && uncategorizedTotal / total > UNCATEGORIZED_NOTE_THRESHOLD;
}

// Same key the driver-breakdown route (app/api/signals/driver-breakdown/route.ts)
// assigns to a signal with no event_category — kept here too so the chart's
// own aggregation and ordering helpers don't need the route's module.
export const UNCATEGORIZED_KEY = "uncategorized" as const;
// Bucket real categories beyond a chart's own-color budget fold into here —
// see DriverBreakdownChart.tsx's MAX_OWN_CATEGORIES.
export const OTHER_KEY = "other" as const;

export type CategoryCountRow = { category: string; count: number };

export type CategoryPartition = {
  /** Real (non-uncategorized) categories, sorted most-to-least frequent. */
  realCategories: [string, number][];
  uncategorizedTotal: number;
  total: number;
};

/**
 * Aggregate per-day/per-category rows into per-category totals, splitting the
 * uncategorized bucket out from real event categories.
 */
export function partitionCategoryCounts(rows: CategoryCountRow[]): CategoryPartition {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.category, (totals.get(r.category) ?? 0) + r.count);
  const uncategorizedTotal = totals.get(UNCATEGORIZED_KEY) ?? 0;
  const realCategories = Array.from(totals.entries())
    .filter(([cat]) => cat !== UNCATEGORIZED_KEY)
    .sort((a, b) => b[1] - a[1]);
  const total = Array.from(totals.values()).reduce((a, b) => a + b, 0);
  return { realCategories, uncategorizedTotal, total };
}

/**
 * True when every signal in the window landed in the uncategorized bucket —
 * the window is entirely pre-event_category signals. Founder decision
 * 2026-10-01: no paid backfill for these, so the chart must still render
 * (as a single band) instead of looking broken or empty.
 */
export function isAllUncategorized(partition: CategoryPartition): boolean {
  return partition.total > 0 && partition.realCategories.length === 0 && partition.uncategorizedTotal > 0;
}

/**
 * Orders category keys for the stacked chart: real categories most-to-least
 * frequent (folding any beyond `maxOwnCategories` into a single "other" key),
 * then uncategorized always LAST — regardless of its own count relative to
 * the real categories — so its position in the stack never moves between
 * renders or windows.
 */
export function orderSeriesKeys(partition: CategoryPartition, maxOwnCategories: number): string[] {
  const ownReal = partition.realCategories.slice(0, maxOwnCategories).map(([cat]) => cat);
  const overflow = partition.realCategories.slice(maxOwnCategories);
  const otherTotal = overflow.reduce((sum, [, c]) => sum + c, 0);
  const keys = [...ownReal];
  if (otherTotal > 0) keys.push(OTHER_KEY);
  if (partition.uncategorizedTotal > 0) keys.push(UNCATEGORIZED_KEY);
  return keys;
}
