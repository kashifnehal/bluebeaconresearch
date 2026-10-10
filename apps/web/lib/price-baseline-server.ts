import type { RouteSupabaseClients } from "@/lib/supabase-server";
import { fetchAllRangedRows } from "@/lib/paged-range-fetch";
import {
  TIME_HORIZON_CHECKPOINTS,
  type SignalOutcomeRow,
} from "@/lib/market-impact-assessment";
import {
  buildHourlyWindows,
  computeMatchedWindowBaseline,
  type BaselineWindow,
  type WindowMoveBaseline,
} from "@/lib/price-baseline";

const CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntry = { windows: BaselineWindow[]; expiresAt: number };

// Cached per asset + window length rather than per final baseline: the
// hourly commodity_prices windows for an asset barely change within an hour,
// but the matched outcome rows (and therefore the baseline result) differ
// per signal/asset-list request, so only the windows are safe to reuse.
const hourlyWindowCache = new Map<string, CacheEntry>();

async function getHourlyWindows(
  supabase: RouteSupabaseClients["supabase"],
  asset: string,
  windowHours: number,
): Promise<BaselineWindow[]> {
  const cacheKey = `${asset}:${windowHours}`;
  const cached = hourlyWindowCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.windows;
  }

  const { rows, error } = await fetchAllRangedRows<{
    price: number;
    fetched_at: string;
  }>((from, to) =>
    supabase
      .from("commodity_prices")
      .select("price, fetched_at")
      .eq("symbol", asset)
      .order("fetched_at", { ascending: true })
      .range(from, to),
  );

  if (error) {
    console.error("[price-baseline] commodity_prices query error:", error);
    return [];
  }

  const windows = buildHourlyWindows(
    rows.map((r) => ({ price: r.price, fetchedAt: r.fetched_at })),
    windowHours,
  );
  hourlyWindowCache.set(cacheKey, { windows, expiresAt: Date.now() + CACHE_TTL_MS });
  return windows;
}

/**
 * Asset-level matched price-window baseline for every window length in
 * TIME_HORIZON_CHECKPOINTS, built from the exact signal_outcomes rows the
 * caller already fetched (never refetches signal_outcomes). Never throws —
 * an asset that fails to query or doesn't clear the sample-size gate at any
 * window length simply gets an empty array.
 */
export async function fetchMatchedBaselines(
  supabase: RouteSupabaseClients["supabase"],
  assets: string[],
  outcomeRows: SignalOutcomeRow[],
): Promise<Record<string, WindowMoveBaseline[]>> {
  const result: Record<string, WindowMoveBaseline[]> = {};

  for (const asset of assets) {
    const baselines: WindowMoveBaseline[] = [];
    try {
      for (const windowHours of TIME_HORIZON_CHECKPOINTS) {
        const windows = await getHourlyWindows(supabase, asset, windowHours);
        const eventStartMs = outcomeRows
          .filter(
            (r) =>
              r.asset === asset &&
              r.checkpoint_hours === windowHours &&
              typeof r.actual_pct_change === "number" &&
              Number.isFinite(r.actual_pct_change) &&
              r.actual_pct_change !== 0 &&
              typeof r.eventDate === "string" &&
              r.eventDate,
          )
          .map((r) => new Date(r.eventDate as string).getTime())
          .filter((ms) => Number.isFinite(ms));

        const baseline = computeMatchedWindowBaseline(windows, eventStartMs, windowHours);
        if (baseline) baselines.push(baseline);
      }
    } catch (error) {
      console.error("[price-baseline] fetchMatchedBaselines error:", error);
      result[asset] = [];
      continue;
    }
    result[asset] = baselines;
  }

  return result;
}
