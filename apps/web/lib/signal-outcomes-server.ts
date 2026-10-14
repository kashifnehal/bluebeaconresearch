import type { RouteSupabaseClients } from "@/lib/supabase-server";
import type { SignalOutcomeRow } from "@/lib/market-impact-assessment";

const OUTCOME_ROWS_PAGE_SIZE = 1000;

const OUTCOME_COLUMNS =
  "asset, checkpoint_hours, actual_pct_change, signals(event_date)";

// BBR working value. No published source.
export const OUTCOME_ROWS_CACHE_TTL_MS = 5 * 60 * 1000;

type RawOutcomeRow = {
  asset: string;
  checkpoint_hours: number;
  actual_pct_change: number | null;
  signals: { event_date: string | null } | { event_date: string | null }[] | null;
};

type OutcomeCacheEntry = { rows: SignalOutcomeRow[]; expiresAt: number };

// Successful reads only. A failed page is not stored, so the next call retries.
const outcomeRowsCache = new Map<string, OutcomeCacheEntry>();

// Two requests for the same sorted asset list that arrive before either
// finishes share this one in-flight read instead of both re-reading the table.
const inFlightOutcomeRows = new Map<string, Promise<SignalOutcomeRow[]>>();

function eventDateFromEmbed(
  signals: RawOutcomeRow["signals"],
): string | null {
  if (!signals) return null;
  const row = Array.isArray(signals) ? signals[0] : signals;
  return row?.event_date ?? null;
}

function outcomeRowsCacheKey(assets: string[]): string {
  return [...assets].sort().join("\0");
}

function mapOutcomePage(page: RawOutcomeRow[]): SignalOutcomeRow[] {
  return page.map((row) => ({
    asset: row.asset,
    checkpoint_hours: row.checkpoint_hours,
    actual_pct_change: row.actual_pct_change,
    eventDate: eventDateFromEmbed(row.signals),
  }));
}

async function readOutcomePage(
  supabase: RouteSupabaseClients["supabase"],
  assets: string[],
  from: number,
): Promise<{ rows: SignalOutcomeRow[]; error: string | null; length: number }> {
  const { data: page, error } = await supabase
    .from("signal_outcomes")
    .select(OUTCOME_COLUMNS)
    .in("asset", assets)
    .not("actual_pct_change", "is", null)
    .order("id", { ascending: true })
    .range(from, from + OUTCOME_ROWS_PAGE_SIZE - 1);

  if (error) {
    console.error("[signal-outcomes] signal_outcomes query error:", error.message);
    return { rows: [], error: error.message, length: 0 };
  }

  const raw = (page ?? []) as unknown as RawOutcomeRow[];
  return { rows: mapOutcomePage(raw), error: null, length: raw.length };
}

async function loadSignalOutcomeRows(
  supabase: RouteSupabaseClients["supabase"],
  assets: string[],
): Promise<{ rows: SignalOutcomeRow[]; cacheable: boolean }> {
  const first = await readOutcomePage(supabase, assets, 0);
  if (first.error) {
    return { rows: [], cacheable: false };
  }
  if (first.length < OUTCOME_ROWS_PAGE_SIZE) {
    return { rows: first.rows, cacheable: true };
  }

  const { count, error: countError } = await supabase
    .from("signal_outcomes")
    .select(OUTCOME_COLUMNS, { count: "exact", head: true })
    .in("asset", assets)
    .not("actual_pct_change", "is", null);

  if (countError) {
    console.error("[signal-outcomes] signal_outcomes query error:", countError.message);
    return { rows: first.rows, cacheable: false };
  }
  if (typeof count !== "number") {
    console.error("[signal-outcomes] signal_outcomes query error:", "missing count");
    return { rows: first.rows, cacheable: false };
  }

  const offsets: number[] = [];
  for (
    let from = OUTCOME_ROWS_PAGE_SIZE;
    from < count;
    from += OUTCOME_ROWS_PAGE_SIZE
  ) {
    offsets.push(from);
  }

  if (offsets.length === 0) {
    return { rows: first.rows, cacheable: true };
  }

  const rest = await Promise.all(
    offsets.map((from) => readOutcomePage(supabase, assets, from)),
  );

  const rows = [...first.rows];
  for (const page of rest) {
    if (page.error) {
      return { rows, cacheable: false };
    }
    rows.push(...page.rows);
    if (page.length < OUTCOME_ROWS_PAGE_SIZE) {
      return { rows, cacheable: true };
    }
  }
  return { rows, cacheable: true };
}

/**
 * Pages through signal_outcomes for the given assets. PostgREST caps a single
 * response at its configured max-rows (this project's signal_outcomes easily
 * exceeds that per asset), so a single unranged .select() would silently
 * truncate and undercount every asset/checkpoint — the same bug
 * app/api/signals/[id]/route.ts's magnitude query was fixed for. The first
 * page is 1000 rows ordered by id. A full page is followed by one exact count
 * with the same filters, then the remaining pages are read together. Successful
 * results are cached briefly, keyed by the sorted asset list; a failed page is
 * not cached. Embeds signals.event_date via the signal_outcomes.signal_id FK
 * so callers can match tracked signals to their event start time without a
 * second query.
 */
export type OutcomeCacheStatus = "hit" | "miss" | "inflight";

export type OutcomeRowsObservation = {
  cacheStatus: OutcomeCacheStatus;
};

export async function fetchSignalOutcomeRows(
  supabase: RouteSupabaseClients["supabase"],
  assets: string[],
  observation?: OutcomeRowsObservation,
): Promise<SignalOutcomeRow[]> {
  const key = outcomeRowsCacheKey(assets);
  const cached = outcomeRowsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    if (observation) observation.cacheStatus = "hit";
    return cached.rows;
  }

  const existing = inFlightOutcomeRows.get(key);
  if (existing) {
    if (observation) observation.cacheStatus = "inflight";
    return existing;
  }

  if (observation) observation.cacheStatus = "miss";

  const fetchPromise = loadSignalOutcomeRows(supabase, assets).then((result) => {
    if (result.cacheable) {
      outcomeRowsCache.set(key, {
        rows: result.rows,
        expiresAt: Date.now() + OUTCOME_ROWS_CACHE_TTL_MS,
      });
    }
    return result.rows;
  });

  inFlightOutcomeRows.set(key, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightOutcomeRows.delete(key);
  }
}
