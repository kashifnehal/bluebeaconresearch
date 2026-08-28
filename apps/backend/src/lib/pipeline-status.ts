import { getRedis } from "../clients/redis.js";

export type CollectorResult = {
  fetched?: number;
  inserted?: number;
  duplicates?: number;
  filtered?: number;
  signals?: number;
  updated?: number;
  ok?: boolean;
  error?: string;
  // RSS collector only: how many of the configured feeds parsed vs. threw this
  // cycle. Surfaced so a slow accumulation of dead feeds is visible in
  // pipeline:last_run instead of only in Railway logs (#63).
  feedsOk?: number;
  feedsFailed?: number;
};

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
};

const REDIS_KEY = "pipeline:last_run";
const CRON_INTERVAL_MS = 15 * 60 * 1000;
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

  return {
    lastFetchedAt: finishedAt.toISOString(),
    nextFetchEstimate: new Date(finishedAt.getTime() + CRON_INTERVAL_MS).toISOString(),
    collectors,
    totals: { inserted, signals, fetched },
  };
}

export async function recordPipelineRun(status: PipelineRunStatus): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(REDIS_KEY, JSON.stringify(status), "EX", 86400);
  } catch (e: any) {
    console.warn("[pipeline-status] Redis write failed:", e.message);
  }

  await trackZeroYieldStreak(status, redis);
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
