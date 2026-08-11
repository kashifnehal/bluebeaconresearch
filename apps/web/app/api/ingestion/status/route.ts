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
};

function getUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET() {
  let status: PipelineRunStatus | null = null;

  const redis = getUpstashRedis();
  if (redis) {
    try {
      const raw = await redis.get<string>("pipeline:last_run");
      if (raw) {
        status = typeof raw === "string" ? JSON.parse(raw) : (raw as PipelineRunStatus);
      }
    } catch {
      // fall through to Supabase fallback
    }
  }

  // Fallback: infer last fetch from newest raw_event ingestion time
  if (!status) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
          nextFetchEstimate: new Date(new Date(lastFetchedAt).getTime() + 15 * 60 * 1000).toISOString(),
          collectors: {},
          totals: { inserted: 0, signals: 0, fetched: 0 },
        };
      }
    }
  }

  return NextResponse.json({
    status,
    cronIntervalMinutes: 15,
  });
}
