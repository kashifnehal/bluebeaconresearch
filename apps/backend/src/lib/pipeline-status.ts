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
