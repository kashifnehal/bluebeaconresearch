import type { EventCategory } from "@blue-beacon-research/shared";
import { EVENT_CATEGORY_LABELS } from "./market-impact-assessment";
import { UNCATEGORIZED_KEY } from "./driver-breakdown";
import { csvField } from "./signal-csv";

export type DriverBreakdownRow = { date: string; category: string; count: number };

const CSV_COLUMNS = ["Date", "Category", "Signals"] as const;

// Matches the legend label DriverBreakdownChart.tsx shows for this key — kept
// its own category line here too, never folded into "Other" the way the
// chart's own color-budget overflow is (see DriverBreakdownChart's
// MAX_OWN_CATEGORIES comment): this export is of what was fetched, not of
// how the chart chose to render it.
function categoryLabel(category: string): string {
  if (category === UNCATEGORIZED_KEY) return "Older signals (not categorized)";
  return EVENT_CATEGORY_LABELS[category as EventCategory] ?? category;
}

/**
 * Exports every fetched driver-breakdown row — including categories the
 * chart folds into "Other" and series the viewer has hidden in the legend —
 * as counts only (no percentages, direction, or scores).
 */
export function driverBreakdownToCsv(
  rows: DriverBreakdownRow[],
  _assetLabel: string,
  _rangeId: string,
): string {
  const sorted = [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const la = categoryLabel(a.category);
    const lb = categoryLabel(b.category);
    return la < lb ? -1 : la > lb ? 1 : 0;
  });

  const dataLines = sorted.map((r) =>
    [
      csvField(r.date, false),
      csvField(categoryLabel(r.category), true),
      csvField(String(r.count), false),
    ].join(","),
  );

  return [CSV_COLUMNS.map((c) => csvField(c, false)).join(","), ...dataLines].join("\r\n");
}
