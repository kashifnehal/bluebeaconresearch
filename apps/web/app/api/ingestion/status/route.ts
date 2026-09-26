import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PipelineRunStatus = {
  lastFetchedAt: string;
  nextFetchEstimate: string;
  collectors: Record<string, unknown>;
  totals: { inserted: number; signals: number; fetched: number };
  // Real cron cadence in minutes, self-reported by the backend (buildPipelineStatus)
  // from its own INGESTION_INTERVAL_CRON. Only present on the "redis" source path —
  // the raw_events-inference fallback below has no way to know the real cadence.
  intervalMinutes?: number;
};

// Used only when pipeline:last_run is unavailable and lastFetchedAt/nextFetchEstimate
// must be inferred from raw_events instead. Matches the current real production
// cadence (Railway's INGESTION_INTERVAL_CRON, confirmed via service_health_events
// timestamps landing on :00/:30). Update this if that cron cadence changes and no
// "redis" source is available to self-report it.
const FALLBACK_INTERVAL_MINUTES = 30;

function getUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET() {
  let status: PipelineRunStatus | null = null;
  // "redis"  = real pipeline:last_run, per-collector health is trustworthy
  // "fallback" = Redis empty/unreachable, inferred lastFetchedAt from raw_events only
  // "none"   = nothing available at all
  let source: "redis" | "fallback" | "none" = "none";

  const redis = getUpstashRedis();
  if (redis) {
    try {
      const raw = await redis.get<string>("pipeline:last_run");
      if (raw) {
        status = typeof raw === "string" ? JSON.parse(raw) : (raw as PipelineRunStatus);
        source = "redis";
      }
    } catch {
      // fall through to Supabase fallback
    }
  }

  // Fallback: infer last fetch from newest raw_event ingestion time. Reaching here
  // means the backend never wrote pipeline:last_run — almost always Upstash being
  // unreachable / quota-exhausted on the writer side (see recordPipelineRun in
  // apps/backend/src/lib/pipeline-status.ts). Per-collector health is unknowable.
  if (!status) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // Accept either key name — see lib/supabase-server.ts for why.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (supabaseUrl && serviceKey) {
      const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data } = await supabase
        .from("raw_events")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.created_at) {
        const lastFetchedAt = data.created_at as string;
        status = {
          lastFetchedAt,
          nextFetchEstimate: new Date(
            new Date(lastFetchedAt).getTime() + FALLBACK_INTERVAL_MINUTES * 60 * 1000,
          ).toISOString(),
          collectors: {},
          totals: { inserted: 0, signals: 0, fetched: 0 },
        };
        source = "fallback";
      }
    }
  }

  const degraded = source !== "redis";
  const reason =
    source === "redis"
      ? null
      : source === "fallback"
        ? "pipeline:last_run is unavailable (Upstash Redis unreachable or quota-exhausted on the writer). Showing the last raw_events insert time only — per-collector health and last-run counts are unknown."
        : "No ingestion status available: pipeline:last_run is empty and no raw_events rows were found.";

  return NextResponse.json({
    status,
    cronIntervalMinutes: status?.intervalMinutes ?? FALLBACK_INTERVAL_MINUTES,
    degraded,
    reason,
  });
}
