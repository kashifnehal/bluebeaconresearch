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

export type TableCountSignal = {
  eventDate?: string | null;
  createdAt?: string | null;
  commodityImpacts?: readonly { direction: string }[] | null;
  currencyPairImpacts?: readonly { direction: string }[] | null;
};

export type TableCountLine = {
  loaded: number;
  days: number;
  up: number;
  down: number;
  volatile: number;
  neutral: number;
  noImpact: number;
};

/** First commodity impact, else the first currency-pair impact. */
export function primaryTableImpact<T>(signal: {
  commodityImpacts?: readonly T[] | null;
  currencyPairImpacts?: readonly T[] | null;
}): T | undefined {
  return signal.commodityImpacts?.[0] ?? signal.currencyPairImpacts?.[0];
}

function utcCalendarDay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Counts over the rows already loaded. Direction uses the same primary
 * impact as the table's Direction cell. `days` is distinct UTC calendar
 * dates of `eventDate`, or `createdAt` when `eventDate` is missing.
 * A direction outside up/down/volatile/neutral counts as no impact so the
 * five buckets cover every loaded row.
 */
export function tableCountLine(signals: readonly TableCountSignal[]): TableCountLine {
  const counts: TableCountLine = {
    loaded: signals.length,
    days: 0,
    up: 0,
    down: 0,
    volatile: 0,
    neutral: 0,
    noImpact: 0,
  };
  const days = new Set<string>();
  for (const signal of signals) {
    const day = utcCalendarDay(signal.eventDate ?? signal.createdAt);
    if (day) days.add(day);
    const direction = primaryTableImpact(signal)?.direction;
    if (direction === "up" || direction === "down" || direction === "volatile" || direction === "neutral") {
      counts[direction] += 1;
    } else {
      counts.noImpact += 1;
    }
  }
  counts.days = days.size;
  return counts;
}

function countWord(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "Other" is volatile + neutral + no impact. "loaded" stays in the sentence. */
export function formatTableCountLine(counts: TableCountLine): string {
  const other = counts.volatile + counts.neutral + counts.noImpact;
  return `${countWord(counts.loaded, "signal", "signals")} loaded · ${countWord(counts.days, "day", "days")} · Up ${counts.up} · Down ${counts.down} · Other ${other}`;
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
