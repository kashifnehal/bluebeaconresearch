export type SignalTableSortColumn = "date" | "severity" | "reports";
export type SignalTableSortDirection = "asc" | "desc";

export type SignalTableSortableRow = {
  eventDate?: string | null;
  createdAt?: string;
  severity: number;
  sourcesCount: number;
};

/**
 * Client-side sort for SignalTable's 3 sortable columns (Date/Severity/
 * Reports) over the rows already loaded — never a server round-trip. Stable
 * (ties keep original relative order), and a row with no usable Date value
 * always sorts last regardless of direction, not just at whichever end
 * ascending/descending happens to put it.
 */
export function sortSignalTableRows<T extends SignalTableSortableRow>(
  rows: T[],
  column: SignalTableSortColumn | null,
  direction: SignalTableSortDirection,
): T[] {
  if (!column) return rows;

  function value(row: T): number | null {
    if (column === "severity") return row.severity;
    if (column === "reports") return row.sourcesCount;
    const raw = row.eventDate ?? row.createdAt;
    const t = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(t) ? t : null;
  }

  return rows
    .map((row, index) => ({ row, index, value: value(row) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      if (a.value === b.value) return a.index - b.index;
      return direction === "asc" ? a.value - b.value : b.value - a.value;
    })
    .map((entry) => entry.row);
}

export const SIGNAL_TABLE_SUMMARY_MAX_LENGTH = 120;

/** First 120 chars of a signal's summary, with an ellipsis if it was cut. */
export function truncateSignalSummary(
  summary: string,
  maxLength: number = SIGNAL_TABLE_SUMMARY_MAX_LENGTH,
): string {
  if (summary.length <= maxLength) return summary;
  return `${summary.slice(0, maxLength)}…`;
}
