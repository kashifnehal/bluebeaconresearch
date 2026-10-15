import { getEnv } from "../env.js";
import { isAnthropicBudgetAvailable } from "./anthropic-budget.js";
import { isAnthropicUsageLimitAlerted } from "./pipeline-status.js";
import { recordServiceHealth, type RecordServiceHealthOptions } from "./service-health.js";

// A feed that goes quieter than its own 14-day p95 gap. The 95th percentile
// and the 100-row minimum are conventions, not researched cutoffs.
// Do not alarm when collection is already paused: a closed daily ingestion
// budget (isAnthropicBudgetAvailable returns false) or the provider usage-limit
// flag (isAnthropicUsageLimitAlerted) both stop new rows on purpose.
//
// Silence starts at the later of the feed's last_seen and the check that first
// saw collection running again. The budget flag and the usage-limit flag are
// booleans, and pipeline:last_run is overwritten every cycle, so the resume
// moment is a feed-volume health row. A paused check writes "collection paused"
// once. The next check that sees collection running writes "collection resumed"
// once and later checks read that row.
//
// Two checks in a row before a degraded row is an engineering choice with no
// outside source. FEED_VOLUME_CONSECUTIVE_CHECKS overrides the default of 2.
const MIN_ROWS_14D = 100;
const COLLECTION_PAUSED = "collection paused";
const COLLECTION_RESUMED = "collection resumed";

export type FeedVolumeSupabase = {
  from: (table: string) => any;
};

type FeedGapRow = {
  feed_name: string | null;
  rows_14d: number | string | null;
  last_seen: string | null;
  p95_gap_hours: number | string | null;
};

type HealthRow = {
  status?: string;
  detail?: string | null;
  created_at?: string | null;
};

export async function isCollectionPaused(): Promise<boolean> {
  if (!(await isAnthropicBudgetAvailable("ingestion"))) return true;
  return isAnthropicUsageLimitAlerted();
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function latestForFeed(rows: HealthRow[], feed: string): HealthRow | undefined {
  return rows.find((row) => {
    const detail = row.detail ?? "";
    return (
      detail.startsWith(`${feed} silent `) ||
      detail.startsWith(`${feed} ok `) ||
      detail.startsWith(`${feed} streak `)
    );
  });
}

function streakCount(detail: string, feed: string): number | null {
  const prefix = `${feed} streak `;
  if (!detail.startsWith(prefix)) return null;
  const n = Number(detail.slice(prefix.length));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function latestCollectionMarker(rows: HealthRow[]): HealthRow | undefined {
  return rows.find(
    (row) => row.detail === COLLECTION_PAUSED || row.detail === COLLECTION_RESUMED,
  );
}

async function readHealth(
  supabase: FeedVolumeSupabase,
  details: string[] | undefined,
  limit: number,
): Promise<HealthRow[]> {
  let query = supabase
    .from("service_health_events")
    .select("status, detail, created_at")
    .eq("service", "feed-volume");
  if (details) query = query.in("detail", details);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message ?? "feed-volume health read failed");
  return [...((data ?? []) as HealthRow[])];
}

async function writeHealth(
  writer: RecordServiceHealthOptions["supabase"],
  status: "ok" | "degraded",
  detail: string,
): Promise<void> {
  await recordServiceHealth("feed-volume", status, detail, undefined, { supabase: writer });
}

/**
 * Compare each sampled feed's silence to its own p95 gap. One degraded row per
 * ongoing gap, and one ok row when that feed is heard from again.
 */
export async function checkFeedVolume(
  supabase: FeedVolumeSupabase,
  now: Date,
  deps: { isCollectionPaused?: () => Promise<boolean> } = {},
): Promise<void> {
  const paused = deps.isCollectionPaused ? await deps.isCollectionPaused() : await isCollectionPaused();
  const writer = supabase as RecordServiceHealthOptions["supabase"];

  if (paused) {
    const marker = latestCollectionMarker(
      await readHealth(supabase, [COLLECTION_PAUSED, COLLECTION_RESUMED], 1),
    );
    if (marker?.detail !== COLLECTION_PAUSED) {
      await writeHealth(writer, "ok", COLLECTION_PAUSED);
    }
    return;
  }

  const { data, error } = await supabase
    .from("feed_gap_p95")
    .select("feed_name, rows_14d, last_seen, p95_gap_hours");
  if (error) throw new Error(error.message ?? "feed_gap_p95 read failed");

  const marker = latestCollectionMarker(
    await readHealth(supabase, [COLLECTION_PAUSED, COLLECTION_RESUMED], 1),
  );
  let resumedAt: number | null = null;
  if (marker?.detail === COLLECTION_PAUSED) {
    await writeHealth(writer, "ok", COLLECTION_RESUMED);
    resumedAt = now.getTime();
  } else if (marker?.detail === COLLECTION_RESUMED && marker.created_at) {
    const ms = Date.parse(marker.created_at);
    if (Number.isFinite(ms)) resumedAt = ms;
  }

  const history = await readHealth(supabase, undefined, 200);
  const required = getEnv().FEED_VOLUME_CONSECUTIVE_CHECKS;

  for (const row of (data ?? []) as FeedGapRow[]) {
    const feed = row.feed_name;
    if (!feed) continue;
    const rows14d = asNumber(row.rows_14d);
    if (rows14d == null || rows14d < MIN_ROWS_14D) continue;
    const p95 = asNumber(row.p95_gap_hours);
    if (p95 == null) continue;
    if (!row.last_seen) continue;
    const lastSeenMs = Date.parse(row.last_seen);
    if (!Number.isFinite(lastSeenMs)) continue;
    const baselineMs = resumedAt != null && resumedAt > lastSeenMs ? resumedAt : lastSeenMs;
    const gapHours = (now.getTime() - baselineMs) / 3_600_000;
    const latest = latestForFeed(history, feed);
    const latestMs = latest?.created_at ? Date.parse(latest.created_at) : Number.NaN;
    const inEpisode = Number.isFinite(latestMs) && latestMs >= baselineMs;

    if (gapHours > p95) {
      if (latest?.status === "degraded" && inEpisode) continue;
      const prev = inEpisode ? (streakCount(latest?.detail ?? "", feed) ?? 0) : 0;
      const next = prev + 1;
      if (next >= required) {
        const detail = `${feed} silent ${gapHours.toFixed(2)}h, p95 ${p95.toFixed(2)}h`;
        await writeHealth(writer, "degraded", detail);
        history.unshift({ status: "degraded", detail, created_at: now.toISOString() });
      } else {
        const detail = `${feed} streak ${next}`;
        await writeHealth(writer, "ok", detail);
        history.unshift({ status: "ok", detail, created_at: now.toISOString() });
      }
      continue;
    }

    if (latest?.status === "degraded") {
      const detail = `${feed} ok ${gapHours.toFixed(2)}h, p95 ${p95.toFixed(2)}h`;
      await writeHealth(writer, "ok", detail);
      history.unshift({ status: "ok", detail, created_at: now.toISOString() });
      continue;
    }

    const openStreak = streakCount(latest?.detail ?? "", feed);
    if (openStreak != null && openStreak > 0) {
      const detail = `${feed} streak 0`;
      await writeHealth(writer, "ok", detail);
      history.unshift({ status: "ok", detail, created_at: now.toISOString() });
    }
  }
}
