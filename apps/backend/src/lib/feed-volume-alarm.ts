import { isAnthropicBudgetAvailable } from "./anthropic-budget.js";
import { isAnthropicUsageLimitAlerted } from "./pipeline-status.js";
import { recordServiceHealth, type RecordServiceHealthOptions } from "./service-health.js";

// P18 — a feed that goes quieter than its own 14-day p95 gap. The 95th
// percentile and the 100-row minimum are conventions, not researched cutoffs.
// Do not alarm when collection is already paused: a closed daily ingestion
// budget (isAnthropicBudgetAvailable returns false) or the provider usage-limit
// flag (isAnthropicUsageLimitAlerted) both stop new rows on purpose.
const MIN_ROWS_14D = 100;

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
    return detail.startsWith(`${feed} silent `) || detail.startsWith(`${feed} ok `);
  });
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
  if (paused) return;

  const { data, error } = await supabase
    .from("feed_gap_p95")
    .select("feed_name, rows_14d, last_seen, p95_gap_hours");
  if (error) throw new Error(error.message ?? "feed_gap_p95 read failed");

  const { data: healthData, error: healthError } = await supabase
    .from("service_health_events")
    .select("status, detail, created_at")
    .eq("service", "feed-volume")
    .order("created_at", { ascending: false })
    .limit(200);
  if (healthError) throw new Error(healthError.message ?? "feed-volume health read failed");

  const history = [...((healthData ?? []) as HealthRow[])];
  const writer = supabase as RecordServiceHealthOptions["supabase"];

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
    const gapHours = (now.getTime() - lastSeenMs) / 3_600_000;
    const latest = latestForFeed(history, feed);
    const latestMs = latest?.created_at ? Date.parse(latest.created_at) : Number.NaN;

    if (gapHours > p95) {
      if (latest && Number.isFinite(latestMs) && latestMs > lastSeenMs) continue;
      const detail = `${feed} silent ${gapHours.toFixed(2)}h, p95 ${p95.toFixed(2)}h`;
      await recordServiceHealth("feed-volume", "degraded", detail, undefined, { supabase: writer });
      history.unshift({ status: "degraded", detail, created_at: now.toISOString() });
      continue;
    }

    if (latest?.status === "degraded") {
      const detail = `${feed} ok ${gapHours.toFixed(2)}h, p95 ${p95.toFixed(2)}h`;
      await recordServiceHealth("feed-volume", "ok", detail, undefined, { supabase: writer });
      history.unshift({ status: "ok", detail, created_at: now.toISOString() });
    }
  }
}
