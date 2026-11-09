import type { FastifyInstance } from "fastify";

import { getSupabaseAdmin } from "../clients/supabase.js";
import { FLAT_THRESHOLD_PCT, actualDirectionFromPct } from "../lib/outcome-threshold.js";

/**
 * Public GET /v1/accuracy. Reads only from signal_outcomes (written once, daily,
 * by outcome-tracker.ts). As of 2026-11-07 the response includes every stored
 * checkpoint (1, 4, 24, and 48 hours), each scored on its own. It never
 * live-recomputes against commodity_prices, which only retains 90 days.
 * No auth: this is the same public informational class of data as the price
 * routes. Sample size is scored pipeline rows, not users (signal_outcomes has
 * no user_id). This handler sets no Cache-Control header, same as before.
 * GET /v1/accuracy returns overall and by_asset for the 48-hour checkpoint
 * and a checkpoints list for the 1, 4, 24 and 48 hour checkpoints.
 */

// Below this many scored (up/down) calls, a hit-rate percentage is more
// misleading than informative. 20 is a judgment call, kept from the previous
// page, not a figure copied from an outside source.
export const MIN_SAMPLE_SIZE = 20;

// volatile/neutral calls are never scored true/false. 2% over the checkpoint
// window is the separate "the price actually moved" mark, about 4x the 0.5%
// flat noise floor outcome-tracker.ts uses for actual_direction. Kept fully
// separate from hit_rate.
export const VOLATILITY_THRESHOLD_PCT = 2;

// Horizons the worker writes. The page shows each of these, not a blend.
export const ACCURACY_CHECKPOINT_HOURS = [1, 4, 24, 48] as const;

// Per-asset rows stay on the longest stored horizon so the older by_asset
// field does not mix checkpoints. The hours travel with the payload.
export const BY_ASSET_CHECKPOINT_HOURS = 48;

const PAGE_SIZE = 1000;
// `.in("id", chunk)` with a real ~36-char UUID list starts throwing
// `TypeError: fetch failed` once the chunk hits ~400 items (380 succeeds,
// 400 fails) — a URL-length limit, not transient network flakiness.
// 200 leaves real margin under that breakpoint.
const SIGNAL_LOOKUP_CHUNK = 200;

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastErr;
}

export type OutcomeRow = {
  signal_id: string;
  asset: string;
  checkpoint_hours: number;
  predicted_direction: string;
  actual_pct_change: number;
  is_directionally_correct: boolean | null;
};

type Bucket = {
  upTotal: number;
  upCorrect: number;
  downTotal: number;
  downCorrect: number;
  sumAbsMoveWhenCorrect: number;
  volatileNeutralTotal: number;
  volatileNeutralAboveThreshold: number;
  // 2026-11-09, honest-accuracy-data task. scoredFlatCount: of up/down-predicted
  // rows only, how many had an actual move under FLAT_THRESHOLD_PCT (a miss,
  // regardless of which way the price barely moved). allRowsTotal/allRowsUpTotal:
  // over EVERY row at this checkpoint (any predicted_direction, since this is
  // describing the market, not our calls) — the baseline "share of windows
  // where the market rose".
  scoredFlatCount: number;
  allRowsTotal: number;
  allRowsUpTotal: number;
  earliest: string | null;
  latest: string | null;
};

function newBucket(): Bucket {
  return {
    upTotal: 0,
    upCorrect: 0,
    downTotal: 0,
    downCorrect: 0,
    sumAbsMoveWhenCorrect: 0,
    volatileNeutralTotal: 0,
    volatileNeutralAboveThreshold: 0,
    scoredFlatCount: 0,
    allRowsTotal: 0,
    allRowsUpTotal: 0,
    earliest: null,
    latest: null,
  };
}

function noteDate(bucket: Bucket, eventDate: string | null) {
  if (!eventDate) return;
  if (!bucket.earliest || eventDate < bucket.earliest) bucket.earliest = eventDate;
  if (!bucket.latest || eventDate > bucket.latest) bucket.latest = eventDate;
}

function applyToBucket(bucket: Bucket, row: OutcomeRow, eventDate: string | null) {
  noteDate(bucket, eventDate);

  // Baseline tally over every row at this checkpoint, any predicted_direction
  // — this is what the market actually did, independent of what we called.
  bucket.allRowsTotal += 1;
  const actualDirection = actualDirectionFromPct(row.actual_pct_change, FLAT_THRESHOLD_PCT);
  if (actualDirection === "up") bucket.allRowsUpTotal += 1;

  if (row.predicted_direction === "volatile" || row.predicted_direction === "neutral") {
    bucket.volatileNeutralTotal += 1;
    if (Math.abs(row.actual_pct_change) >= VOLATILITY_THRESHOLD_PCT) {
      bucket.volatileNeutralAboveThreshold += 1;
    }
    return;
  }

  // Only up/down calls are scored. is_directionally_correct is null for
  // volatile/neutral (already returned) and for anything else we do not score.
  if (row.predicted_direction !== "up" && row.predicted_direction !== "down") return;
  if (row.is_directionally_correct === null) return;

  if (actualDirection === "flat") bucket.scoredFlatCount += 1;

  const correct = row.is_directionally_correct === true;
  if (row.predicted_direction === "up") {
    bucket.upTotal += 1;
    if (correct) {
      bucket.upCorrect += 1;
      bucket.sumAbsMoveWhenCorrect += Math.abs(row.actual_pct_change);
    }
  } else {
    bucket.downTotal += 1;
    if (correct) {
      bucket.downCorrect += 1;
      bucket.sumAbsMoveWhenCorrect += Math.abs(row.actual_pct_change);
    }
  }
}

function directionScore(total: number, correct: number) {
  const enoughHistory = total >= MIN_SAMPLE_SIZE;
  const hitRate = total > 0 ? correct / total : null;
  return {
    total,
    correct,
    hit_rate: enoughHistory ? hitRate : null,
    not_enough_history: !enoughHistory,
  };
}

function dateRange(bucket: Bucket) {
  return bucket.earliest && bucket.latest
    ? { earliest: bucket.earliest, latest: bucket.latest }
    : null;
}

function summarize(bucket: Bucket) {
  const totalScored = bucket.upTotal + bucket.downTotal;
  const correct = bucket.upCorrect + bucket.downCorrect;
  const enoughHistory = totalScored >= MIN_SAMPLE_SIZE;
  const hitRate = totalScored > 0 ? correct / totalScored : null;
  const avgMoveWhenCorrect = correct > 0 ? bucket.sumAbsMoveWhenCorrect / correct : null;
  // Of scored (up/down) calls only — a flat actual move counts as a miss.
  const flatShare = totalScored > 0 ? bucket.scoredFlatCount / totalScored : null;
  // Of EVERY row at this checkpoint (any predicted_direction) — the plain
  // baseline "share of windows where the market rose", independent of the call.
  const marketRoseShare =
    bucket.allRowsTotal > 0 ? bucket.allRowsUpTotal / bucket.allRowsTotal : null;

  return {
    total_scored: totalScored,
    correct,
    hit_rate: enoughHistory ? hitRate : null,
    not_enough_history: !enoughHistory,
    avg_move_when_correct: avgMoveWhenCorrect,
    flat_share: flatShare,
    market_rose_share: marketRoseShare,
    sample_size_note: totalScored,
    volatile_neutral_summary:
      bucket.volatileNeutralTotal > 0
        ? {
            total: bucket.volatileNeutralTotal,
            fraction_above_threshold:
              bucket.volatileNeutralAboveThreshold / bucket.volatileNeutralTotal,
            threshold_pct: VOLATILITY_THRESHOLD_PCT,
          }
        : null,
    date_range: dateRange(bucket),
  };
}

function summarizeCheckpoint(checkpointHours: number, bucket: Bucket) {
  return {
    checkpoint_hours: checkpointHours,
    ...summarize(bucket),
    up: directionScore(bucket.upTotal, bucket.upCorrect),
    down: directionScore(bucket.downTotal, bucket.downCorrect),
  };
}

function spanDates(buckets: Bucket[]) {
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const bucket of buckets) {
    if (bucket.earliest && (!earliest || bucket.earliest < earliest)) earliest = bucket.earliest;
    if (bucket.latest && (!latest || bucket.latest > latest)) latest = bucket.latest;
  }
  return earliest && latest ? { earliest, latest } : null;
}

export function buildAccuracyPayload(
  rows: OutcomeRow[],
  eventDateBySignal: Map<string, string> = new Map(),
) {
  const allowed = new Set<number>(ACCURACY_CHECKPOINT_HOURS);
  const byCheckpoint = new Map<number, Bucket>();
  for (const hours of ACCURACY_CHECKPOINT_HOURS) byCheckpoint.set(hours, newBucket());
  const byAsset = new Map<string, Bucket>();

  for (const row of rows) {
    if (!allowed.has(row.checkpoint_hours)) continue;
    const eventDate = eventDateBySignal.get(row.signal_id) ?? null;
    const checkpointBucket = byCheckpoint.get(row.checkpoint_hours) ?? newBucket();
    applyToBucket(checkpointBucket, row, eventDate);
    byCheckpoint.set(row.checkpoint_hours, checkpointBucket);

    if (row.checkpoint_hours === BY_ASSET_CHECKPOINT_HOURS) {
      const assetBucket = byAsset.get(row.asset) ?? newBucket();
      applyToBucket(assetBucket, row, eventDate);
      byAsset.set(row.asset, assetBucket);
    }
  }

  const checkpoints = ACCURACY_CHECKPOINT_HOURS.map((hours) =>
    summarizeCheckpoint(hours, byCheckpoint.get(hours) ?? newBucket()),
  );
  const byAssetSummary = Object.fromEntries(
    [...byAsset.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([asset, bucket]) => [asset, summarize(bucket)]),
  );

  return {
    overall: summarize(byCheckpoint.get(BY_ASSET_CHECKPOINT_HOURS) ?? newBucket()),
    by_asset: byAssetSummary,
    by_asset_checkpoint_hours: BY_ASSET_CHECKPOINT_HOURS,
    checkpoints,
    date_range: spanDates([...byCheckpoint.values()]),
    min_sample_size: MIN_SAMPLE_SIZE,
    volatility_threshold_pct: VOLATILITY_THRESHOLD_PCT,
    flat_threshold_pct: FLAT_THRESHOLD_PCT,
  };
}

async function fetchAllOutcomes(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<OutcomeRow[]> {
  const rows: OutcomeRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withRetry(async () =>
      supabase
        .from("signal_outcomes")
        .select(
          "signal_id, asset, checkpoint_hours, predicted_direction, actual_pct_change, is_directionally_correct",
        )
        .in("checkpoint_hours", [...ACCURACY_CHECKPOINT_HOURS])
        .range(from, from + PAGE_SIZE - 1),
    );
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as OutcomeRow[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchEventDates(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  signalIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < signalIds.length; i += SIGNAL_LOOKUP_CHUNK) {
    const chunk = signalIds.slice(i, i + SIGNAL_LOOKUP_CHUNK);
    const { data, error } = await withRetry(async () =>
      supabase.from("signals").select("id, event_date").in("id", chunk),
    );
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.event_date) map.set(row.id as string, row.event_date as string);
    }
  }
  return map;
}

export async function accuracyRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    const supabase = getSupabaseAdmin();

    let outcomeRows: OutcomeRow[];
    try {
      outcomeRows = await fetchAllOutcomes(supabase);
    } catch (err) {
      app.log.error({ err }, "[accuracy] signal_outcomes fetch failed");
      return reply.status(500).send({ error: "Query failed" });
    }

    let eventDateBySignal = new Map<string, string>();
    try {
      const distinctSignalIds = [...new Set(outcomeRows.map((r) => r.signal_id))];
      eventDateBySignal = await fetchEventDates(supabase, distinctSignalIds);
    } catch (err) {
      app.log.warn({ err }, "[accuracy] event_date lookup failed — date_range will be null");
    }

    return reply.send({
      ...buildAccuracyPayload(outcomeRows, eventDateBySignal),
      generated_at: new Date().toISOString(),
    });
  });
}
