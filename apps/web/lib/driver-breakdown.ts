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
