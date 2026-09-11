import { getSupabaseAdmin } from "../clients/supabase.js";

/**
 * #121 backend half — permanent outcome tracking for signal_outcomes.
 *
 * commodity_prices only retains 90 days (retention.ts), so an /accuracy page
 * cannot recompute historical accuracy on demand — this worker is what makes
 * that data durable. Daily, it finds every signal that is >=48h old with a
 * non-empty commodity_impacts array and, for each (signal, asset) pair not
 * already recorded, looks up the commodity_prices point closest to event_date
 * and the point closest to event_date + 48h, and writes one signal_outcomes row
 * per pair. Never live-recomputed; never touches signals or commodity_prices.
 */
const CHECKPOINT_HOURS = 48;
const FLAT_THRESHOLD_PCT = 0.5;
const SIGNAL_PAGE_SIZE = 1000;
const PRICE_PAGE_SIZE = 1000;
// 200, not 500: `.in("signal_id", chunk)` with real ~36-char UUIDs starts
// throwing `TypeError: fetch failed` once the chunk hits ~400 items (a URL-length
// limit somewhere in the request chain, root-caused during #121's frontend-half
// verification — reproduced deterministically: 380 always succeeds, 400 always
// fails). This is the same reason 3 of 4 chunks silently failed during this
// worker's initial production backfill run; 200 leaves real margin.
const EXISTING_OUTCOMES_CHUNK = 200;
// Largest real gap observed in commodity_prices (an actual sync outage) is ~18h13m
// (measured via lag() over fetched_at, 2026-09-11). 24h gives that a margin. Beyond
// this, the "closest" point is not a real observation near the target timestamp —
// e.g. forex symbols (EURUSD/GBPUSD/USDJPY/USDCHF/USDRUB/USDCNY) only have price
// history starting 2026-09-09 (#87), so a signal from August with a legacy
// mislabeled EURUSD/USDRUB commodity_impacts entry would otherwise silently clamp
// both price_at_event and price_at_checkpoint to the same distant point and record
// a fabricated 0%/"flat" outcome. Past this distance, treat it as no price data.
const MAX_PRICE_POINT_DISTANCE_MS = 24 * 3_600_000;

type Direction = "up" | "down" | "volatile" | "neutral";

type CommodityImpact = {
  asset: string;
  direction: Direction;
  confidence?: number;
};

type EligibleSignal = {
  id: string;
  event_date: string;
  commodity_impacts: CommodityImpact[];
};

type PricePoint = { price: number; fetchedAtMs: number };

function actualDirectionFromPct(pctChange: number): "up" | "down" | "flat" {
  if (Math.abs(pctChange) < FLAT_THRESHOLD_PCT) return "flat";
  return pctChange > 0 ? "up" : "down";
}

function isDirectionallyCorrect(
  predicted: Direction,
  actual: "up" | "down" | "flat",
): boolean | null {
  if (predicted === "up") return actual === "up";
  if (predicted === "down") return actual === "down";
  // 'volatile' / 'neutral' predictions are intentionally not scored true/false —
  // there is no single actual direction that would validate or invalidate them.
  return null;
}

/**
 * One full ordered price series per asset (there are only ~8 distinct assets in
 * commodity_impacts today), rather than a DB round-trip per (signal, asset) pair —
 * that would be thousands of tiny queries against production Supabase for a single
 * run. Binary-searched in memory instead.
 */
async function loadPriceSeries(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  asset: string,
): Promise<PricePoint[]> {
  const points: PricePoint[] = [];
  for (let from = 0; ; from += PRICE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("commodity_prices")
      .select("price, fetched_at")
      .eq("symbol", asset)
      .order("fetched_at", { ascending: true })
      .range(from, from + PRICE_PAGE_SIZE - 1);
    if (error) {
      console.error(`[outcome-tracker] price series fetch failed for ${asset}:`, error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      const price = row.price as number | null;
      const fetchedAt = row.fetched_at as string | null;
      if (typeof price === "number" && fetchedAt) {
        points.push({ price, fetchedAtMs: new Date(fetchedAt).getTime() });
      }
    }
    if (data.length < PRICE_PAGE_SIZE) break;
  }
  return points;
}

/**
 * Binary search for the series point closest in time to targetMs. Returns null if
 * the series is empty OR the nearest point is farther than MAX_PRICE_POINT_DISTANCE_MS
 * away — a distant "closest" point is not real price data near this timestamp, it's
 * a boundary artifact (see MAX_PRICE_POINT_DISTANCE_MS comment above).
 */
function findClosestPoint(series: PricePoint[], targetMs: number): PricePoint | null {
  if (series.length === 0) return null;

  let closest: PricePoint;
  if (targetMs <= series[0].fetchedAtMs) {
    closest = series[0];
  } else if (targetMs >= series[series.length - 1].fetchedAtMs) {
    closest = series[series.length - 1];
  } else {
    let lo = 0;
    let hi = series.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (series[mid].fetchedAtMs === targetMs) {
        lo = mid;
        hi = mid;
        break;
      }
      if (series[mid].fetchedAtMs < targetMs) lo = mid + 1;
      else hi = mid;
    }
    const after = series[lo];
    const before = series[lo - 1];
    const diffAfter = Math.abs(after.fetchedAtMs - targetMs);
    const diffBefore = before ? Math.abs(before.fetchedAtMs - targetMs) : Infinity;
    closest = diffAfter <= diffBefore ? after : before!;
  }

  if (Math.abs(closest.fetchedAtMs - targetMs) > MAX_PRICE_POINT_DISTANCE_MS) return null;
  return closest;
}

async function fetchEligibleSignals(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  cutoffIso: string,
): Promise<EligibleSignal[]> {
  const eligible: EligibleSignal[] = [];
  for (let from = 0; ; from += SIGNAL_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("signals")
      .select("id, event_date, commodity_impacts")
      .lte("event_date", cutoffIso)
      .order("event_date", { ascending: true })
      .range(from, from + SIGNAL_PAGE_SIZE - 1);
    if (error) {
      console.error("[outcome-tracker] signals fetch failed:", error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      const impacts = (row.commodity_impacts ?? []) as CommodityImpact[];
      if (Array.isArray(impacts) && impacts.length > 0) {
        eligible.push({
          id: row.id as string,
          event_date: row.event_date as string,
          commodity_impacts: impacts,
        });
      }
    }
    if (data.length < SIGNAL_PAGE_SIZE) break;
  }
  return eligible;
}

async function fetchExistingOutcomeAssets(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  signalIds: string[],
): Promise<Map<string, Set<string>>> {
  const bySignal = new Map<string, Set<string>>();
  for (let i = 0; i < signalIds.length; i += EXISTING_OUTCOMES_CHUNK) {
    const chunk = signalIds.slice(i, i + EXISTING_OUTCOMES_CHUNK);
    const { data, error } = await supabase
      .from("signal_outcomes")
      .select("signal_id, asset")
      .in("signal_id", chunk);
    if (error) {
      console.error("[outcome-tracker] existing signal_outcomes fetch failed:", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const set = bySignal.get(row.signal_id as string) ?? new Set<string>();
      set.add(row.asset as string);
      bySignal.set(row.signal_id as string, set);
    }
  }
  return bySignal;
}

export async function runOutcomeTrackerOnce() {
  const supabase = getSupabaseAdmin();
  const cutoffIso = new Date(Date.now() - CHECKPOINT_HOURS * 3_600_000).toISOString();

  const eligible = await fetchEligibleSignals(supabase, cutoffIso);
  if (eligible.length === 0) {
    console.log(
      `[outcome-tracker] no signals >= ${CHECKPOINT_HOURS}h old with non-empty commodity_impacts`,
    );
    return { signalsProcessed: 0, outcomesWritten: 0, pairsSkipped: 0, skipReasons: {} as Record<string, number> };
  }

  const existingBySignal = await fetchExistingOutcomeAssets(
    supabase,
    eligible.map((s) => s.id),
  );

  // Which (signal, asset) pairs actually need work, grouped by asset so each
  // asset's price series is loaded exactly once.
  const pairsByAsset = new Map<string, Array<{ signal: EligibleSignal; impact: CommodityImpact }>>();
  let signalsProcessed = 0;
  for (const signal of eligible) {
    const already = existingBySignal.get(signal.id) ?? new Set<string>();
    const uniqueImpacts = new Map<string, CommodityImpact>();
    for (const impact of signal.commodity_impacts) {
      if (impact?.asset && !uniqueImpacts.has(impact.asset)) uniqueImpacts.set(impact.asset, impact);
    }
    const missing = [...uniqueImpacts.values()].filter((i) => !already.has(i.asset));
    if (missing.length === 0) continue;
    signalsProcessed += 1;
    for (const impact of missing) {
      const list = pairsByAsset.get(impact.asset) ?? [];
      list.push({ signal, impact });
      pairsByAsset.set(impact.asset, list);
    }
  }

  let outcomesWritten = 0;
  let pairsSkipped = 0;
  const skipReasons: Record<string, number> = {};
  const bumpSkip = (reason: string) => {
    pairsSkipped += 1;
    skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
  };

  for (const [asset, pairs] of pairsByAsset) {
    const series = await loadPriceSeries(supabase, asset);
    if (series.length === 0) {
      console.warn(
        `[outcome-tracker] SKIP ${pairs.length} pair(s) for asset=${asset} — no commodity_prices rows exist for this symbol at all`,
      );
      for (let i = 0; i < pairs.length; i++) bumpSkip(`${asset}: no commodity_prices rows for this symbol`);
      continue;
    }

    const rows: Array<Record<string, unknown>> = [];
    for (const { signal, impact } of pairs) {
      const eventMs = new Date(signal.event_date).getTime();
      const checkpointMs = eventMs + CHECKPOINT_HOURS * 3_600_000;

      const eventPoint = findClosestPoint(series, eventMs);
      const checkpointPoint = findClosestPoint(series, checkpointMs);
      if (!eventPoint || !checkpointPoint) {
        console.warn(
          `[outcome-tracker] SKIP signal=${signal.id} asset=${asset} — no price data within ${MAX_PRICE_POINT_DISTANCE_MS / 3_600_000}h of ${!eventPoint ? "event_date" : "checkpoint"} (event=${!!eventPoint} checkpoint=${!!checkpointPoint})`,
        );
        bumpSkip(`${asset}: no price data within ${MAX_PRICE_POINT_DISTANCE_MS / 3_600_000}h of event_date/checkpoint`);
        continue;
      }

      const actualPctChange =
        ((checkpointPoint.price - eventPoint.price) / eventPoint.price) * 100;
      const actualDirection = actualDirectionFromPct(actualPctChange);
      const correct = isDirectionallyCorrect(impact.direction, actualDirection);

      rows.push({
        signal_id: signal.id,
        asset,
        predicted_direction: impact.direction,
        predicted_confidence: impact.confidence ?? null,
        price_at_event: eventPoint.price,
        price_at_checkpoint: checkpointPoint.price,
        checkpoint_hours: CHECKPOINT_HOURS,
        actual_pct_change: actualPctChange,
        actual_direction: actualDirection,
        is_directionally_correct: correct,
      });
    }

    if (rows.length === 0) continue;

    const { error: insertErr } = await supabase.from("signal_outcomes").insert(rows);
    if (insertErr) {
      console.error(
        `[outcome-tracker] insert failed for asset=${asset} (${rows.length} row(s)):`,
        insertErr.message,
      );
      pairsSkipped += rows.length;
      skipReasons[`${asset}: insert failed (${insertErr.message})`] =
        (skipReasons[`${asset}: insert failed (${insertErr.message})`] ?? 0) + rows.length;
      continue;
    }
    outcomesWritten += rows.length;
  }

  console.log(
    `[outcome-tracker] DONE signalsProcessed=${signalsProcessed} outcomesWritten=${outcomesWritten} pairsSkipped=${pairsSkipped}` +
      (Object.keys(skipReasons).length ? ` skipReasons=${JSON.stringify(skipReasons)}` : ""),
  );

  return { signalsProcessed, outcomesWritten, pairsSkipped, skipReasons };
}
