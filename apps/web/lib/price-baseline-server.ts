import type { RouteSupabaseClients } from "@/lib/supabase-server";
import { fetchAllRangedRows } from "@/lib/paged-range-fetch";
import {
  TIME_HORIZON_CHECKPOINTS,
  type SignalOutcomeRow,
} from "@/lib/market-impact-assessment";
import {
  buildHourlyWindows,
  computeMatchedWindowBaseline,
  type WindowMoveBaseline,
} from "@/lib/price-baseline";

const CACHE_TTL_MS = 60 * 60 * 1000;

// BBR working value. No published source.
export const BASELINE_FETCH_TIMEOUT_MS = 3000;

type PricePoint = { price: number; fetchedAt: string };
type PointsCacheEntry = { points: PricePoint[]; expiresAt: number };

// Cached per asset as the raw commodity_prices history, not per
// asset + window length: every window length in TIME_HORIZON_CHECKPOINTS is
// built from the same points, so one cache entry here avoids one full
// (paged) table read per window length. Never caches an error result, so a
// failed read is retried on the next call rather than sticking for an hour.
const pricePointsCache = new Map<string, PointsCacheEntry>();

// Two requests for the same asset that arrive before either finishes share
// this one in-flight read instead of both re-reading the table.
const inFlightPricePoints = new Map<string, Promise<PricePoint[]>>();

async function getAssetPricePoints(
  supabase: RouteSupabaseClients["supabase"],
  asset: string,
): Promise<PricePoint[]> {
  const cached = pricePointsCache.get(asset);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.points;
  }

  const existing = inFlightPricePoints.get(asset);
  if (existing) {
    return existing;
  }

  const fetchPromise = (async () => {
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

    const points = rows.map((r) => ({ price: r.price, fetchedAt: r.fetched_at }));
    pricePointsCache.set(asset, { points, expiresAt: Date.now() + CACHE_TTL_MS });
    return points;
  })();

  inFlightPricePoints.set(asset, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightPricePoints.delete(asset);
  }
}

/**
 * Asset-level matched price-window baseline for every window length in
 * TIME_HORIZON_CHECKPOINTS, built from the exact signal_outcomes rows the
 * caller already fetched (never refetches signal_outcomes). Never throws —
 * an asset that fails to query or doesn't clear the sample-size gate at any
 * window length simply gets an empty array. Assets run in parallel.
 */
export async function fetchMatchedBaselines(
  supabase: RouteSupabaseClients["supabase"],
  assets: string[],
  outcomeRows: SignalOutcomeRow[],
): Promise<Record<string, WindowMoveBaseline[]>> {
  const entries = await Promise.all(
    assets.map(async (asset): Promise<[string, WindowMoveBaseline[]]> => {
      try {
        const points = await getAssetPricePoints(supabase, asset);
        const baselines: WindowMoveBaseline[] = [];
        for (const windowHours of TIME_HORIZON_CHECKPOINTS) {
          const windows = buildHourlyWindows(points, windowHours);
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
        return [asset, baselines];
      } catch (error) {
        console.error("[price-baseline] fetchMatchedBaselines error:", error);
        return [asset, []];
      }
    }),
  );

  return Object.fromEntries(entries);
}

/**
 * Wraps fetchMatchedBaselines so a slow commodity_prices read never holds up
 * the response: the caller gets no baselines instead of waiting past
 * timeoutMs. The underlying fetch keeps running (and still populates the
 * cache for the next request) even after the timer wins.
 */
export async function fetchMatchedBaselinesWithTimeout(
  supabase: RouteSupabaseClients["supabase"],
  assets: string[],
  outcomeRows: SignalOutcomeRow[],
  timeoutMs: number = BASELINE_FETCH_TIMEOUT_MS,
): Promise<Record<string, WindowMoveBaseline[]>> {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<Record<string, WindowMoveBaseline[]>>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve({});
    }, timeoutMs);
  });

  const result = await Promise.race([
    fetchMatchedBaselines(supabase, assets, outcomeRows),
    timeoutPromise,
  ]);

  if (timer) clearTimeout(timer);
  if (timedOut) {
    console.warn(
      `[price-baseline] fetchMatchedBaselines timed out after ${timeoutMs}ms for ${assets.length} asset(s)`,
    );
  }
  return result;
}
