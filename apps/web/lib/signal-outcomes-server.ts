import type { RouteSupabaseClients } from "@/lib/supabase-server";
import type { SignalOutcomeRow } from "@/lib/market-impact-assessment";

const OUTCOME_ROWS_PAGE_SIZE = 1000;

/**
 * Pages through signal_outcomes for the given assets. PostgREST caps a single
 * response at its configured max-rows (this project's signal_outcomes easily
 * exceeds that per asset), so a single unranged .select() would silently
 * truncate and undercount every asset/checkpoint — the same bug
 * app/api/signals/[id]/route.ts's magnitude query was fixed for. Extracted
 * here so the calendar's asset-level market-impact endpoint reuses this exact
 * query instead of reimplementing the paging loop.
 */
type RawOutcomeRow = {
  asset: string;
  checkpoint_hours: number;
  actual_pct_change: number | null;
  signals: { event_date: string | null } | { event_date: string | null }[] | null;
};

function eventDateFromEmbed(
  signals: RawOutcomeRow["signals"],
): string | null {
  if (!signals) return null;
  const row = Array.isArray(signals) ? signals[0] : signals;
  return row?.event_date ?? null;
}

/**
 * Pages through signal_outcomes for the given assets. PostgREST caps a single
 * response at its configured max-rows (this project's signal_outcomes easily
 * exceeds that per asset), so a single unranged .select() would silently
 * truncate and undercount every asset/checkpoint — the same bug
 * app/api/signals/[id]/route.ts's magnitude query was fixed for. Extracted
 * here so the calendar's asset-level market-impact endpoint reuses this exact
 * query instead of reimplementing the paging loop. Embeds signals.event_date
 * via the signal_outcomes.signal_id FK so callers can match tracked signals
 * to their event start time without a second query.
 */
export async function fetchSignalOutcomeRows(
  supabase: RouteSupabaseClients["supabase"],
  assets: string[],
): Promise<SignalOutcomeRow[]> {
  const rows: SignalOutcomeRow[] = [];
  for (let from = 0; ; from += OUTCOME_ROWS_PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from("signal_outcomes")
      .select("asset, checkpoint_hours, actual_pct_change, signals(event_date)")
      .in("asset", assets)
      .not("actual_pct_change", "is", null)
      .range(from, from + OUTCOME_ROWS_PAGE_SIZE - 1);

    if (error) {
      console.error("[signal-outcomes] signal_outcomes query error:", error.message);
      break;
    }
    for (const row of (page ?? []) as unknown as RawOutcomeRow[]) {
      rows.push({
        asset: row.asset,
        checkpoint_hours: row.checkpoint_hours,
        actual_pct_change: row.actual_pct_change,
        eventDate: eventDateFromEmbed(row.signals),
      });
    }
    if (!page || page.length < OUTCOME_ROWS_PAGE_SIZE) break;
  }
  return rows;
}
