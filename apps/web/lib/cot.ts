// CFTC Commitments of Traders (managed money) helpers. The weekly report is
// published by the US Commodity Futures Trading Commission with a lag; the
// numbers are descriptive and carry no view on price.

export const COT_WEEKS = 52;
/** Weekly data: cache an hour at the edge, serve stale for a day. */
export const COT_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
/** Short cache for "not available" so a table created later shows up soon. */
export const COT_UNAVAILABLE_CACHE_CONTROL = "public, s-maxage=300";

export type CotRow = {
  /** Report date, YYYY-MM-DD. */
  reportDate: string;
  long: number;
  short: number;
  /** long minus short. */
  net: number;
  /** Managed-money spreading positions, when the table carries them. */
  spread: number | null;
};

export type CotPayload =
  | { available: false; error?: string }
  | { available: true; symbol: string; rows: CotRow[] };

// Column names of public.cot_positions (migration 20261017180000, written and
// not applied as of 2026-10-17): report_date, symbol, mm_long, mm_short,
// mm_spread. Rows without a date, long and short are dropped.

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeCotRows(raw: unknown[]): CotRow[] {
  const rows: CotRow[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const dateRaw = row.report_date;
    const date = typeof dateRaw === "string" ? dateRaw.slice(0, 10) : null;
    const long = toNumber(row.mm_long);
    const short = toNumber(row.mm_short);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || long == null || short == null) continue;
    rows.push({
      reportDate: date,
      long,
      short,
      net: long - short,
      spread: toNumber(row.mm_spread),
    });
  }
  return rows.sort((a, b) => a.reportDate.localeCompare(b.reportDate));
}

export type CotSummary = {
  latest: CotRow;
  /** Change in net position from the previous report, or null with one report. */
  netChange: number | null;
};

export function summarizeCot(rows: CotRow[]): CotSummary | null {
  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  return { latest, netChange: prev ? latest.net - prev.net : null };
}

/** Postgres undefined_table, PostgREST schema-cache miss, undefined_column. */
export function isMissingTableError(err: { code?: string } | null | undefined): boolean {
  return err?.code === "42P01" || err?.code === "PGRST205";
}

export function isSchemaMismatchError(err: { code?: string } | null | undefined): boolean {
  return err?.code === "42703";
}

export type CotHttpResult = { status: number; body: CotPayload | { error: string }; cacheControl: string };

/** Pure mapping from a query result to the HTTP response. */
export function cotResponseFromQuery(
  symbol: string,
  result: { data: unknown[] | null; error: { code?: string; message?: string } | null },
): CotHttpResult {
  if (result.error) {
    if (isMissingTableError(result.error) || isSchemaMismatchError(result.error)) {
      return {
        status: 200,
        body: { available: false },
        cacheControl: COT_UNAVAILABLE_CACHE_CONTROL,
      };
    }
    return { status: 500, body: { error: "db_error" }, cacheControl: "no-store" };
  }
  const rows = normalizeCotRows(result.data ?? []).slice(-COT_WEEKS);
  return {
    status: 200,
    body: { available: true, symbol, rows },
    cacheControl: COT_CACHE_CONTROL,
  };
}
