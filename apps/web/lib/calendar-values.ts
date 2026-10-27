// Formatting for the "Latest official figures" panel on the economic
// calendar. Pure functions only — the route (app/api/calendar/values) owns
// the DB read; this module just turns rows from `economic_event_values`
// into display strings. No forecast values: this panel only ever shows
// figures an official source actually published.

export type OfficialFigureRow = {
  series_id: string;
  period: string; // week-ending date, YYYY-MM-DD
  value: number; // raw stored value, in the row's own `unit`
  unit: string;
  source_url: string;
  released_at: string;
  fetched_at: string; // ISO timestamp
};

export type FormattedOfficialFigure = {
  seriesId: string;
  label: string;
  period: string; // e.g. "Week ending Oct 17, 2026"
  latestValueText: string;
  unitText: string; // e.g. "million barrels" or "Bcf"
  previousValueText: string | null;
  changeText: string | null; // e.g. "+2.4" or "-3.1"; null when there is no previous row
  sourceUrl: string;
  fetchedMonthYear: string; // e.g. "October 2026"
};

type SeriesSpec = {
  label: string;
  decimals: number;
  unitText: string;
  // Raw stored value -> the number actually displayed (e.g. thousand barrels -> million barrels).
  toDisplayValue: (raw: number) => number;
};

// Fixed display order — only these two series are ever requested by the route.
const SERIES_ORDER = ["WCESTUS1", "NW2_EPG0_SWO_R48_BCF"] as const;

const SERIES_SPECS: Record<string, SeriesSpec> = {
  WCESTUS1: {
    label: "U.S. commercial crude oil stocks (excluding SPR)",
    decimals: 1,
    unitText: "million barrels",
    toDisplayValue: (raw) => raw / 1000, // stored in thousand barrels; shown in million barrels
  },
  NW2_EPG0_SWO_R48_BCF: {
    label: "U.S. Lower 48 working gas in storage",
    decimals: 0,
    unitText: "Bcf",
    toDisplayValue: (raw) => raw, // stored and shown in Bcf
  },
};

function formatSigned(n: number, decimals: number): string {
  const fixed = Math.abs(n).toFixed(decimals);
  return n < 0 ? `-${fixed}` : `+${fixed}`;
}

function formatWeekEnding(period: string): string {
  const d = new Date(`${period}T00:00:00Z`);
  const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `Week ending ${formatted}`;
}

function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Groups rows by series_id, keeps only the two most recent periods per series
 * (the route is already expected to send at most that many, but this stays
 * correct even if it sends more), and formats each series for display.
 * Series with no rows are simply absent from the result. A series with only
 * one row shows a latest value but no previous value and no change.
 */
export function formatOfficialFigures(rows: OfficialFigureRow[]): FormattedOfficialFigure[] {
  const bySeries = new Map<string, OfficialFigureRow[]>();
  for (const row of rows) {
    const spec = SERIES_SPECS[row.series_id];
    if (!spec) continue;
    const list = bySeries.get(row.series_id) ?? [];
    list.push(row);
    bySeries.set(row.series_id, list);
  }

  const out: FormattedOfficialFigure[] = [];
  for (const seriesId of SERIES_ORDER) {
    const rowsForSeries = bySeries.get(seriesId);
    if (!rowsForSeries || rowsForSeries.length === 0) continue;
    const spec = SERIES_SPECS[seriesId];
    const sorted = rowsForSeries.slice().sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
    const latest = sorted[0];
    const previous = sorted[1] ?? null;
    const latestDisplay = spec.toDisplayValue(latest.value);
    const previousDisplay = previous ? spec.toDisplayValue(previous.value) : null;
    out.push({
      seriesId,
      label: spec.label,
      period: formatWeekEnding(latest.period),
      latestValueText: latestDisplay.toFixed(spec.decimals),
      unitText: spec.unitText,
      previousValueText: previousDisplay != null ? previousDisplay.toFixed(spec.decimals) : null,
      changeText: previousDisplay != null ? formatSigned(latestDisplay - previousDisplay, spec.decimals) : null,
      sourceUrl: latest.source_url,
      fetchedMonthYear: formatMonthYear(latest.fetched_at),
    });
  }
  return out;
}
