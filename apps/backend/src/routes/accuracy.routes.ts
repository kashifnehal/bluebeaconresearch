import type { FastifyInstance } from "fastify";

import { getSupabaseAdmin } from "../clients/supabase.js";

/**
 * #121 frontend half — public GET /v1/accuracy. Reads only from `signal_outcomes`
 * (written once, daily, by `outcome-tracker.ts`) — never live-recomputes against
 * `commodity_prices`, which only retains 90 days. No auth: this is the same public
 * "informational, not personal" class of data as `/v1/prices` / `/v1/prices/history-5y`.
 *
 * Follows the same plain-async-function Fastify-plugin pattern as price-history.ts /
 * signal-chat.routes.ts (registered in app.ts via `app.register(..., { prefix })`).
 */

// Below this many scored (up/down) predictions, a headline hit-rate percentage is
// more misleading than informative (e.g. "100% (1/1)"). 20 is a judgment call, not
// a hard requirement from any spec — easy to tune up/down as real history accrues;
// flagged here rather than picked silently.
const MIN_SAMPLE_SIZE = 20;

// 'volatile'/'neutral' predictions are never scored true/false (there is no single
// actual_direction that validates or invalidates "expect volatility" or "expect no
// clear move"), but the page still wants a fair way to describe whether that
// volatility call played out. 2% over the 48h checkpoint window is a deliberately
// chosen (not guessed-and-forgotten) threshold: it's roughly 4x the 0.5% "flat"
// noise floor `outcome-tracker.ts` already uses for actual_direction, so it
// separates "the price actually moved a lot" from "normal day-to-day chop" without
// needing a separate volatility calibration per asset. Kept fully separate from
// hit_rate — never blended into the up/down accuracy number.
const VOLATILITY_THRESHOLD_PCT = 2;

const PAGE_SIZE = 1000;
// Root-caused during verification: `.in("id", chunk)` with a real ~36-char UUID
// list starts throwing `TypeError: fetch failed` once the chunk hits ~400 items
// (reproduced deterministically: 380 always succeeds, 400 always fails) — a URL-
// length limit somewhere in the request chain, not transient network flakiness.
// This is also why `outcome-tracker.ts`'s existing-outcomes lookup (same 500-chunk
// pattern) silently dropped some chunks during the #121 backend-half backfill.
// 200 leaves real margin under the ~380-item breakpoint.
const SIGNAL_LOOKUP_CHUNK = 200;

/** Cheap insurance for genuine transient network blips; the real "fetch failed"
 * cause above is a chunk-size bug, now fixed at the source (SIGNAL_LOOKUP_CHUNK). */
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

type OutcomeRow = {
  signal_id: string;
  asset: string;
  predicted_direction: string;
  actual_pct_change: number;
  is_directionally_correct: boolean | null;
};

type Bucket = {
  totalScored: number;
  correct: number;
  sumAbsMoveWhenCorrect: number;
  volatileNeutralTotal: number;
  volatileNeutralAboveThreshold: number;
  earliest: string | null;
  latest: string | null;
};

function newBucket(): Bucket {
  return {
    totalScored: 0,
    correct: 0,
    sumAbsMoveWhenCorrect: 0,
    volatileNeutralTotal: 0,
    volatileNeutralAboveThreshold: 0,
    earliest: null,
    latest: null,
  };
}

function applyToBucket(bucket: Bucket, row: OutcomeRow, eventDate: string | null) {
  if (eventDate) {
    if (!bucket.earliest || eventDate < bucket.earliest) bucket.earliest = eventDate;
    if (!bucket.latest || eventDate > bucket.latest) bucket.latest = eventDate;
  }

  if (row.predicted_direction === "volatile" || row.predicted_direction === "neutral") {
    bucket.volatileNeutralTotal += 1;
    if (Math.abs(row.actual_pct_change) >= VOLATILITY_THRESHOLD_PCT) {
      bucket.volatileNeutralAboveThreshold += 1;
    }
    return; // never blended into hit_rate/correct below
  }

  // Only 'up'/'down' predictions are scored (is_directionally_correct is non-null
  // for those, NULL for volatile/neutral — already handled above, this is defensive).
  if (row.is_directionally_correct === null) return;
  bucket.totalScored += 1;
  if (row.is_directionally_correct) {
    bucket.correct += 1;
    bucket.sumAbsMoveWhenCorrect += Math.abs(row.actual_pct_change);
  }
}

function summarize(bucket: Bucket) {
  const enoughHistory = bucket.totalScored >= MIN_SAMPLE_SIZE;
  const hitRate = bucket.totalScored > 0 ? bucket.correct / bucket.totalScored : null;
  const avgMoveWhenCorrect = bucket.correct > 0 ? bucket.sumAbsMoveWhenCorrect / bucket.correct : null;

  return {
    total_scored: bucket.totalScored,
    correct: bucket.correct,
    // Gated per the spec: below MIN_SAMPLE_SIZE, hit_rate is null and
    // not_enough_history is true instead of a misleadingly small-sample number.
    // sample_size_note is always present alongside it either way.
    hit_rate: enoughHistory ? hitRate : null,
    not_enough_history: !enoughHistory,
    avg_move_when_correct: avgMoveWhenCorrect,
    sample_size_note: bucket.totalScored,
    volatile_neutral_summary:
      bucket.volatileNeutralTotal > 0
        ? {
            total: bucket.volatileNeutralTotal,
            fraction_above_threshold:
              bucket.volatileNeutralAboveThreshold / bucket.volatileNeutralTotal,
            threshold_pct: VOLATILITY_THRESHOLD_PCT,
          }
        : null,
    date_range:
      bucket.earliest && bucket.latest
        ? { earliest: bucket.earliest, latest: bucket.latest }
        : null,
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
        .select("signal_id, asset, predicted_direction, actual_pct_change, is_directionally_correct")
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
      // date_range degrading to null is acceptable; the hit-rate numbers below do
      // not depend on it, so don't fail the whole endpoint over this lookup.
      app.log.warn({ err }, "[accuracy] event_date lookup failed — date_range will be null");
    }

    const overall = newBucket();
    const byAsset = new Map<string, Bucket>();

    for (const row of outcomeRows) {
      const eventDate = eventDateBySignal.get(row.signal_id) ?? null;
      applyToBucket(overall, row, eventDate);
      const assetBucket = byAsset.get(row.asset) ?? newBucket();
      applyToBucket(assetBucket, row, eventDate);
      byAsset.set(row.asset, assetBucket);
    }

    const byAssetSummary = Object.fromEntries(
      [...byAsset.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([asset, bucket]) => [asset, summarize(bucket)]),
    );

    return reply.send({
      overall: summarize(overall),
      by_asset: byAssetSummary,
      min_sample_size: MIN_SAMPLE_SIZE,
      volatility_threshold_pct: VOLATILITY_THRESHOLD_PCT,
      generated_at: new Date().toISOString(),
    });
  });
}
