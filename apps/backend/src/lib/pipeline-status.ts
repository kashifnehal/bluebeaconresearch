import cron from "node-cron";

import { getRedis } from "../clients/redis.js";

export type CollectorResult = {
  fetched?: number;
  inserted?: number;
  duplicates?: number;
  filtered?: number;
  signals?: number;
  updated?: number;
  // Every collector's normal return path sets `ok` explicitly now. `ok !== true`
  // (including a missing value, e.g. the Promise.allSettled rejection shape
  // `{ error }`) is treated as a failed run by the health tracking below.
  ok?: boolean;
  error?: string;
  // RSS collector only: how many of the configured feeds parsed vs. threw this
  // cycle. Surfaced so a slow accumulation of dead feeds is visible in
  // pipeline:last_run instead of only in Railway logs (#63). RSS's `ok` is
  // derived from these — a run is "ok" only if <=50% of feeds failed.
  feedsOk?: number;
  feedsFailed?: number;
};

// Collectors we track run-to-run health for. Order/keys must match what
// runIngestionCycle assembles into `collectors`.
export const COLLECTOR_KEYS = ["gdelt", "gnews", "rss", "prices"] as const;
export type CollectorKey = (typeof COLLECTOR_KEYS)[number];

export type PipelineRunStatus = {
  lastFetchedAt: string;
  nextFetchEstimate: string;
  collectors: {
    rss?: CollectorResult;
    gnews?: CollectorResult;
    gdelt?: CollectorResult;
    prices?: CollectorResult;
  };
  totals: {
    inserted: number;
    signals: number;
    fetched: number;
  };
  // Per-collector health, carried across runs via a read-then-write against the
  // same pipeline:last_run key (#63 follow-up: twice now a collector has died and
  // stayed dead for hours/days with zero visibility). recordPipelineRun computes
  // consecutiveFailures/lastSuccessAt; workers.ts reads them to fire a Sentry
  // alert once per threshold-crossing and flips `alerted` via markCollectorsAlerted.
  consecutiveFailures?: Record<string, number>;
  lastSuccessAt?: Record<string, string>;
  alerted?: Record<string, boolean>;
  // Real cron cadence in minutes, so /api/ingestion/status (apps/web) can display
  // and evaluate "overdue" against the actual interval instead of a guess that
  // drifts out of sync whenever INGESTION_INTERVAL_CRON changes.
  intervalMinutes: number;
};

const REDIS_KEY = "pipeline:last_run";
const DEFAULT_INGESTION_INTERVAL_MINUTES = 15;

// W7-IO-FIX-v2: the old version here only matched "*/N * * * *" — any other valid
// cron shape (e.g. "0 */2 * * *", "0 * * * *", a comma minute-list) silently fell
// back to the 15-minute default, which fed a wrong number into the "/status" page,
// the "next run in" banner, and the zero-yield alert's cadence math. This mirrors
// workers.ts's own cron.validate() gate (node-cron is already a dependency; it's
// used here only to reject malformed expressions, not to do the minute-math).
let lastWarnedInvalidCronExpr: string | undefined;
function warnInvalidCronOnce(expr: string, reason: string) {
  if (lastWarnedInvalidCronExpr === expr) return;
  lastWarnedInvalidCronExpr = expr;
  console.warn(
    `[pipeline-status] INGESTION_INTERVAL_CRON="${expr}" ${reason} — using default ${DEFAULT_INGESTION_INTERVAL_MINUTES}m`,
  );
}

export function getIngestionIntervalMinutes(): number {
  const expr = process.env.INGESTION_INTERVAL_CRON;
  if (!expr) return DEFAULT_INGESTION_INTERVAL_MINUTES;

  if (!cron.validate(expr)) {
    warnInvalidCronOnce(expr, "is not a valid cron expression");
    return DEFAULT_INGESTION_INTERVAL_MINUTES;
  }

  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    warnInvalidCronOnce(expr, "did not split into 5 fields");
    return DEFAULT_INGESTION_INTERVAL_MINUTES;
  }
  const [minute, hour] = parts;

  // "*/N * * * *" — every N minutes.
  const minuteStep = minute.match(/^\*\/(\d+)$/);
  if (minuteStep && hour === "*") {
    return Number(minuteStep[1]);
  }

  // "0 */N * * *" — every N hours, on the hour.
  const hourStep = hour.match(/^\*\/(\d+)$/);
  if (minute === "0" && hourStep) {
    return Number(hourStep[1]) * 60;
  }

  // "0 * * * *" — hourly.
  if (minute === "0" && hour === "*") {
    return 60;
  }

  // A comma list in the minute field (e.g. "0,20,40 * * * *"): the real cadence is
  // the smallest gap between consecutive (sorted) fire times — if the list has only
  // two values that's just their gap, otherwise take the smallest gap across all of
  // them, since that's the fastest the banner/alert math needs to assume.
  if (/^\d+(,\d+)+$/.test(minute) && hour === "*") {
    const values = minute.split(",").map(Number).sort((a, b) => a - b);
    let smallestGap = Infinity;
    for (let i = 1; i < values.length; i++) {
      smallestGap = Math.min(smallestGap, values[i] - values[i - 1]);
    }
    if (Number.isFinite(smallestGap) && smallestGap > 0) return smallestGap;
  }

  warnInvalidCronOnce(expr, "is valid cron but not a recognized ingestion-interval shape");
  return DEFAULT_INGESTION_INTERVAL_MINUTES;
}

/** Test-only: clears the "already warned about this cron string" dedupe state. */
export function resetCronWarningStateForTests() {
  lastWarnedInvalidCronExpr = undefined;
}
const ZERO_YIELD_STREAK_KEY = "pipeline:consecutive_zero_yield";
// 3 consecutive 15-min cycles with literally nothing fetched from any source is a
// different signal than normal per-source degradation (rate limits, one feed 404ing) —
// it's the "a shared format change broke every collector at once" scenario, and
// nothing currently distinguishes that from a slow news day without this counter.
const ZERO_YIELD_ALERT_THRESHOLD = 3;

export function buildPipelineStatus(
  collectors: PipelineRunStatus["collectors"],
  finishedAt: Date = new Date(),
): PipelineRunStatus {
  const inserted =
    (collectors.rss?.inserted ?? 0) +
    (collectors.gnews?.inserted ?? 0) +
    (collectors.gdelt?.inserted ?? 0);
  const signals =
    (collectors.rss?.signals ?? 0) +
    (collectors.gnews?.signals ?? 0) +
    (collectors.gdelt?.signals ?? 0);
  const fetched =
    (collectors.rss?.fetched ?? 0) +
    (collectors.gnews?.fetched ?? 0) +
    (collectors.gdelt?.fetched ?? 0);

  const intervalMinutes = getIngestionIntervalMinutes();

  return {
    lastFetchedAt: finishedAt.toISOString(),
    nextFetchEstimate: new Date(finishedAt.getTime() + intervalMinutes * 60 * 1000).toISOString(),
    collectors,
    totals: { inserted, signals, fetched },
    intervalMinutes,
  };
}

function collectorSucceeded(result: CollectorResult | undefined): boolean {
  return result?.ok === true;
}

/**
 * Persists this run's status AND updates the run-to-run per-collector health
 * counters (read-then-write against the same key). Returns the enriched status so
 * the caller (workers.ts) can decide whether to alert without a second read.
 */
export async function recordPipelineRun(status: PipelineRunStatus): Promise<PipelineRunStatus> {
  const redis = getRedis();

  // Read the prior run's health BEFORE overwriting so the counters carry forward.
  let prev: PipelineRunStatus | null = null;
  if (redis) {
    try {
      const raw = await redis.get(REDIS_KEY);
      if (raw) prev = typeof raw === "string" ? (JSON.parse(raw) as PipelineRunStatus) : (raw as PipelineRunStatus);
    } catch (e: any) {
      console.warn("[pipeline-status] Redis read of prior run failed:", e.message);
    }
  }

  const consecutiveFailures: Record<string, number> = {};
  const lastSuccessAt: Record<string, string> = {};
  const alerted: Record<string, boolean> = {};

  for (const key of COLLECTOR_KEYS) {
    if (collectorSucceeded(status.collectors[key])) {
      consecutiveFailures[key] = 0;
      lastSuccessAt[key] = status.lastFetchedAt;
      alerted[key] = false; // a healthy run re-arms the alert
    } else {
      consecutiveFailures[key] = (prev?.consecutiveFailures?.[key] ?? 0) + 1;
      const priorSuccess = prev?.lastSuccessAt?.[key];
      if (priorSuccess) lastSuccessAt[key] = priorSuccess;
      alerted[key] = prev?.alerted?.[key] ?? false;
    }
  }

  const enriched: PipelineRunStatus = { ...status, consecutiveFailures, lastSuccessAt, alerted };

  if (!redis) {
    // Loud on purpose (#63 follow-up): a silent skip here is exactly why
    // /api/ingestion/status went blind (collectors: {}) — the web route can only
    // fall back to raw_events inference when this key is missing.
    console.error(
      "[pipeline-status] Redis unavailable — pipeline:last_run NOT written this cycle. " +
        "/api/ingestion/status and the ingestion banner will fall back to raw_events inference with no per-collector health. " +
        "(Upstash quota exhausted, or the ioredis circuit breaker is open — see clients/redis.ts.)",
    );
    return enriched;
  }

  try {
    await redis.set(REDIS_KEY, JSON.stringify(enriched), "EX", 86400);
  } catch (e: any) {
    console.error("[pipeline-status] Redis write FAILED — pipeline:last_run is now stale/missing:", e.message);
  }

  await trackZeroYieldStreak(enriched, redis);
  return enriched;
}

/**
 * Flips `alerted[key] = true` for collectors that just crossed their alert
 * threshold, so workers.ts doesn't re-fire the same Sentry alert every cycle
 * while a collector stays down. recordPipelineRun resets it back to false on the
 * next healthy run.
 */
export async function markCollectorsAlerted(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    const raw = await redis.get(REDIS_KEY);
    if (!raw) return;
    const status: PipelineRunStatus =
      typeof raw === "string" ? (JSON.parse(raw) as PipelineRunStatus) : (raw as PipelineRunStatus);
    status.alerted = status.alerted ?? {};
    for (const k of keys) status.alerted[k] = true;
    await redis.set(REDIS_KEY, JSON.stringify(status), "EX", 86400);
  } catch (e: any) {
    console.warn("[pipeline-status] Failed to persist alerted flags:", e.message);
  }
}

// claude/252 action step 3: dedup flag for the Anthropic usage-limit/credit-
// exhaustion Sentry alert fired from claude.service.ts's classifyEvent() catch
// block. Deliberately NOT folded into COLLECTOR_KEYS/`alerted` above — that
// machinery is read-modify-written once per ingestion cycle (15-30 min) against
// a single `pipeline:last_run` blob keyed by *cycle-level* consecutiveFailures
// counts, and classifyEvent() is called many times per cycle (once per raw
// event) — sharing that key would race the cycle's own write and isn't the
// right shape (a usage-limit cap is a persistent on/off condition, not a
// consecutive-failure count). A separate, simple flag with its own TTL is the
// cleaner fit; same "flip true on alert, clear on recovery" idiom as
// markCollectorsAlerted/recordPipelineRun above, just independently keyed.
const ANTHROPIC_USAGE_LIMIT_ALERTED_KEY = "anthropic:usage_limit_alerted";
const ANTHROPIC_USAGE_LIMIT_ALERTED_TTL_SECONDS = 86400;

export async function isAnthropicUsageLimitAlerted(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    return (await redis.get(ANTHROPIC_USAGE_LIMIT_ALERTED_KEY)) === "true";
  } catch (e: any) {
    console.warn("[pipeline-status] anthropic usage-limit flag read failed:", e.message);
    return false;
  }
}

export async function setAnthropicUsageLimitAlerted(value: boolean): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    if (value) {
      await redis.set(
        ANTHROPIC_USAGE_LIMIT_ALERTED_KEY,
        "true",
        "EX",
        ANTHROPIC_USAGE_LIMIT_ALERTED_TTL_SECONDS,
      );
    } else {
      await redis.del(ANTHROPIC_USAGE_LIMIT_ALERTED_KEY);
    }
  } catch (e: any) {
    console.warn("[pipeline-status] anthropic usage-limit flag write failed:", e.message);
  }
}

async function trackZeroYieldStreak(
  status: PipelineRunStatus,
  redis: ReturnType<typeof getRedis>,
): Promise<void> {
  if (!redis) return;
  const isZeroYield = status.totals.fetched === 0;
  try {
    if (!isZeroYield) {
      await redis.del(ZERO_YIELD_STREAK_KEY);
      return;
    }
    const streak = await redis.incr(ZERO_YIELD_STREAK_KEY);
    await redis.expire(ZERO_YIELD_STREAK_KEY, 86400);
    if (streak >= ZERO_YIELD_ALERT_THRESHOLD) {
      console.error(
        `[pipeline-status] ALERT: ${streak} consecutive zero-yield ingestion cycles (nothing fetched from RSS, GNews, or GDELT) — likely a shared failure (feed format change, network block, upstream outage), not normal per-source degradation.`,
      );
    } else {
      console.warn(`[pipeline-status] zero-yield cycle ${streak}/${ZERO_YIELD_ALERT_THRESHOLD} — nothing fetched this run`);
    }
  } catch (e: any) {
    console.warn("[pipeline-status] zero-yield streak tracking failed:", e.message);
  }
}

export async function getPipelineRunStatus(): Promise<PipelineRunStatus | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(REDIS_KEY);
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as PipelineRunStatus) : (raw as PipelineRunStatus);
  } catch {
    return null;
  }
}

export { REDIS_KEY };
