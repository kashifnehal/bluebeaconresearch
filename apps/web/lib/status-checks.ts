import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { BASEMAP_TILE_URLS } from "@/lib/map-config";

export type CheckStatus = "Operational" | "Degraded" | "Unknown";
export type SystemCheck = { name: string; status: CheckStatus; detail: string };

const CHECK_TIMEOUT_MS = 3000;

// Ingestion runs every 15 min (docs/brain/15_INGESTION_PIPELINE.md) — 2x cadence is a
// reasonable "still healthy" cutoff that won't false-alarm on ordinary run jitter.
const FRESHNESS_CUTOFF_MS = 30 * 60 * 1000;

// Ingestion collectors that feed the Intelligence Feed (the `signals` table) via
// raw_events — gdelt/gnews/rss run inside runIngestionCycle() and acled runs right
// after it, all on the same INGESTION_INTERVAL_CRON tick (apps/backend/src/workers.ts).
// price-syncer ("yahoo_finance") writes market prices, not signal content, so it's
// excluded here.
const INGESTION_COLLECTOR_SERVICES = ["gdelt", "gnews", "rss", "acled"] as const;

// Observed production service_health_events timestamps land on :00 and :30 — a
// 30-minute write interval (INGESTION_INTERVAL_CRON is "*/30 * * * *" in production;
// see docs/brain/15_INGESTION_PIPELINE.md). 2x that interval, derived from the
// observed write interval, not a sourced threshold.
const INGESTION_HEALTH_WRITE_INTERVAL_MS = 30 * 60 * 1000;
const INGESTION_HEALTH_FRESHNESS_CUTOFF_MS = INGESTION_HEALTH_WRITE_INTERVAL_MS * 2;

function formatMinutesAgo(ms: number): string {
  return `${Math.round(ms / 60000)} min ago`;
}

/**
 * Pure decision logic for the Intelligence Feed check, split out from the Supabase
 * fetch so it can be unit tested without a live DB. `latestOkHealthRow` is the most
 * recent status:'ok' row across INGESTION_COLLECTOR_SERVICES (or null if none exist
 * within the lookback window the caller queried); `latestSignalCreatedAt` is used
 * only to add age-of-newest-signal as extra detail text, never as the pass/fail rule.
 */
export function evaluateIntelligenceFeedHealth(
  latestOkHealthRow: { service: string; created_at: string } | null,
  latestSignalCreatedAt: string | null,
  now: number = Date.now(),
): SystemCheck {
  const signalDetail = latestSignalCreatedAt
    ? `newest signal ${formatMinutesAgo(now - new Date(latestSignalCreatedAt).getTime())}`
    : "no signals recorded yet";

  if (!latestOkHealthRow) {
    return {
      name: "Intelligence Feed",
      status: "Degraded",
      detail: `No ingestion collector (gdelt/gnews/rss/acled) has reported healthy (${signalDetail})`,
    };
  }

  const ageMs = now - new Date(latestOkHealthRow.created_at).getTime();
  const healthy = ageMs <= INGESTION_HEALTH_FRESHNESS_CUTOFF_MS;
  return {
    name: "Intelligence Feed",
    status: healthy ? "Operational" : "Degraded",
    detail: `${latestOkHealthRow.service} collector last reported healthy ${formatMinutesAgo(ageMs)} (${signalDetail})`,
  };
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("status check timed out")), ms)),
  ]);
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept either key name — see lib/supabase-server.ts for why.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function getUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function checkIntelligenceFeed(): Promise<SystemCheck> {
  const unknownDetail = "At least one ingestion collector (gdelt/gnews/rss/acled) reported healthy recently";
  const supabase = getAdminSupabase();
  if (!supabase) return { name: "Intelligence Feed", status: "Unknown", detail: unknownDetail };

  try {
    const [healthResult, signalResult] = await Promise.all([
      withTimeout(
        supabase
          .from("service_health_events")
          .select("service, created_at")
          .in("service", INGESTION_COLLECTOR_SERVICES)
          .eq("status", "ok")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        CHECK_TIMEOUT_MS,
      ),
      withTimeout(
        supabase.from("signals").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        CHECK_TIMEOUT_MS,
      ),
    ]);

    if (healthResult.error) return { name: "Intelligence Feed", status: "Unknown", detail: unknownDetail };

    return evaluateIntelligenceFeedHealth(
      healthResult.data as { service: string; created_at: string } | null,
      (signalResult.data?.created_at as string | undefined) ?? null,
    );
  } catch {
    return { name: "Intelligence Feed", status: "Unknown", detail: unknownDetail };
  }
}

async function checkAlertDelivery(): Promise<SystemCheck> {
  const detail = "At least one user has a Telegram or Slack channel connected (config presence, not a live send)";
  const supabase = getAdminSupabase();
  if (!supabase) return { name: "Alert Delivery", status: "Unknown", detail };

  try {
    // Config-presence check, not a live send: at least one user has a delivery
    // channel actually connected (telegram_chat_id only lands here via the live
    // Telegram bot webhook completing a /connect flow, which can't happen unless
    // the bot token + webhook path are genuinely configured and reachable).
    const { data, error } = await withTimeout(
      supabase.from("user_channels").select("telegram_chat_id, slack_webhook_url").limit(20),
      CHECK_TIMEOUT_MS,
    );
    if (error) return { name: "Alert Delivery", status: "Unknown", detail };

    const hasConnectedChannel = (data ?? []).some((r) => r.telegram_chat_id || r.slack_webhook_url);
    return { name: "Alert Delivery", status: hasConnectedChannel ? "Operational" : "Degraded", detail };
  } catch {
    return { name: "Alert Delivery", status: "Unknown", detail };
  }
}

async function checkGlobalMap(): Promise<SystemCheck> {
  const detail = "Basemap tile server responds";
  try {
    const tileUrl = BASEMAP_TILE_URLS[0].replace("{z}", "0").replace("{x}", "0").replace("{y}", "0");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(tileUrl, { signal: controller.signal, cache: "no-store" });
      return { name: "Global Map", status: res.ok ? "Operational" : "Degraded", detail };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { name: "Global Map", status: "Unknown", detail };
  }
}

async function checkDataPipeline(): Promise<SystemCheck> {
  const detail = "Most recent ingested event, across all collectors combined, is less than 30 minutes old";

  // Reuses the same tracking /api/ingestion/status already relies on (Redis
  // `pipeline:last_run`, falling back to the newest `raw_events` row) instead of
  // adding a second instrumentation path.
  let lastFetchedAt: string | null = null;
  let usedFallback = false;

  const redis = getUpstashRedis();
  if (redis) {
    try {
      const raw = await withTimeout(redis.get<string>("pipeline:last_run"), CHECK_TIMEOUT_MS);
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        lastFetchedAt = parsed?.lastFetchedAt ?? null;
      }
    } catch {
      // fall through to DB fallback below
    }
  }

  if (!lastFetchedAt) {
    usedFallback = true;
    const supabase = getAdminSupabase();
    if (supabase) {
      try {
        const { data } = await withTimeout(
          supabase.from("raw_events").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
          CHECK_TIMEOUT_MS,
        );
        lastFetchedAt = (data?.created_at as string | undefined) ?? null;
      } catch {
        // leave null — falls through to Unknown below
      }
    }
  }

  if (!lastFetchedAt) return { name: "Data Pipeline", status: "Unknown", detail };

  const ageMs = Date.now() - new Date(lastFetchedAt).getTime();
  const fresh = ageMs <= FRESHNESS_CUTOFF_MS;
  // When the pipeline:last_run health feed itself is missing, we're inferring
  // freshness from raw_events alone and can't see per-collector state — never
  // report a clean "Operational" off that.
  if (usedFallback) {
    return {
      name: "Data Pipeline",
      status: "Degraded",
      detail: `${detail} — health feed unavailable, freshness inferred from raw_events only`,
    };
  }
  return { name: "Data Pipeline", status: fresh ? "Operational" : "Degraded", detail };
}

export async function getSystemChecks(): Promise<SystemCheck[]> {
  return Promise.all([checkIntelligenceFeed(), checkAlertDelivery(), checkGlobalMap(), checkDataPipeline()]);
}
