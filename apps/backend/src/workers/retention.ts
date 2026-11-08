import { getSupabaseAdmin } from "../clients/supabase.js";

/**
 * #67 data retention (also covers #95 item 1d). Two weekly jobs, run from workers.ts
 * on the same node-cron mechanism as the daily sanctions sync.
 *
 * Windows are the proposals from docs/brain/04_DATABASE.md §5 (a judgment call, not a
 * founder decision — revisit if product needs change):
 *   - commodity_prices: delete rows older than 90 days outright (the watchlist
 *     sparkline / price-at-signal comparisons only need recent granularity).
 *   - raw_events: delete rows older than 180 days ONLY when a signals row already
 *     references them in raw_event_ids (the classified signal is the durable
 *     artifact; the raw article text has no further product use). Rows with no
 *     signal yet are left untouched — reconciliation.ts owns those.
 *   - signals: never deleted here. That table is the product.
 */
const COMMODITY_PRICES_RETENTION_DAYS = 90;
const RAW_EVENTS_RETENTION_DAYS = 180;
export const SERVICE_HEALTH_RETENTION_DAYS = 45;
// Engineering choice with no outside source. The longest reader is the month-to-date spend check (31 days) plus a weekly job gap (7 days); rounded up to 45.
export const SERVICE_HEALTH_KEEP_SERVICES = [
  "materiality_gate",
  "gate-drift",
  "feed-volume",
  "category-guard",
  "anthropic-monthly",
  "sanctions_sync",
] as const;
// The prune_service_health_events SQL function (supabase/migrations) holds the same list — keep them in sync.
const SERVICE_HEALTH_BATCH = 2000;
const SERVICE_HEALTH_MAX_BATCHES = 10;
const SERVICE_HEALTH_BATCH_PAUSE_MS = 1000;
const RAW_EVENTS_CANDIDATE_BATCH = 500;
const RAW_EVENTS_MAX_BATCHES_PER_RUN = 40; // safety cap: ≤20k rows/run

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function runCommodityPricesRetentionOnce() {
  const supabase = getSupabaseAdmin();
  const cutoff = daysAgoIso(COMMODITY_PRICES_RETENTION_DAYS);

  const { count, error: countErr } = await supabase
    .from("commodity_prices")
    .select("*", { count: "exact", head: true })
    .lt("fetched_at", cutoff);

  if (countErr) {
    console.error("[retention] commodity_prices count failed:", countErr.message);
    return { ok: false as const, table: "commodity_prices", deleted: 0, error: countErr.message };
  }

  const toDelete = count ?? 0;
  if (toDelete === 0) {
    console.log(
      `[retention] commodity_prices: 0 rows older than ${COMMODITY_PRICES_RETENTION_DAYS}d (cutoff ${cutoff}) — nothing to do`,
    );
    return { ok: true as const, table: "commodity_prices", deleted: 0 };
  }

  const { error: delErr } = await supabase
    .from("commodity_prices")
    .delete()
    .lt("fetched_at", cutoff);

  if (delErr) {
    console.error("[retention] commodity_prices delete failed:", delErr.message);
    return { ok: false as const, table: "commodity_prices", deleted: 0, error: delErr.message };
  }

  console.log(
    `[retention] commodity_prices: deleted ${toDelete} row(s) older than ${COMMODITY_PRICES_RETENTION_DAYS}d (cutoff ${cutoff})`,
  );
  return { ok: true as const, table: "commodity_prices", deleted: toDelete };
}

export async function runRawEventsRetentionOnce() {
  const supabase = getSupabaseAdmin();
  const cutoff = daysAgoIso(RAW_EVENTS_RETENTION_DAYS);

  let deleted = 0;
  let scanned = 0;
  let skippedNoSignal = 0;

  for (let batch = 0; batch < RAW_EVENTS_MAX_BATCHES_PER_RUN; batch++) {
    // Oldest-first so repeated runs make forward progress. Candidates already
    // deleted this run won't reappear; candidates we skip (no signal) will — so we
    // page past them with a growing offset.
    const { data: candidates, error: candErr } = await supabase
      .from("raw_events")
      .select("id")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .range(skippedNoSignal, skippedNoSignal + RAW_EVENTS_CANDIDATE_BATCH - 1);

    if (candErr) {
      console.error("[retention] raw_events candidate fetch failed:", candErr.message);
      return {
        ok: false as const,
        table: "raw_events",
        deleted,
        error: candErr.message,
      };
    }
    if (!candidates?.length) break;
    scanned += candidates.length;

    const ids = candidates.map((c) => c.id as string);
    const { data: sigRows, error: sigErr } = await supabase
      .from("signals")
      .select("raw_event_ids")
      .overlaps("raw_event_ids", ids);

    if (sigErr) {
      console.error("[retention] raw_events signal lookup failed:", sigErr.message);
      return { ok: false as const, table: "raw_events", deleted, error: sigErr.message };
    }

    const covered = new Set<string>(
      (sigRows ?? []).flatMap((s) => (s.raw_event_ids as string[] | null) ?? []),
    );
    const deletable = ids.filter((id) => covered.has(id));
    skippedNoSignal += ids.length - deletable.length;

    if (deletable.length > 0) {
      const { error: delErr } = await supabase
        .from("raw_events")
        .delete()
        .in("id", deletable);
      if (delErr) {
        console.error("[retention] raw_events delete failed:", delErr.message);
        return { ok: false as const, table: "raw_events", deleted, error: delErr.message };
      }
      deleted += deletable.length;
    }

    if (candidates.length < RAW_EVENTS_CANDIDATE_BATCH) break;
  }

  console.log(
    `[retention] raw_events: deleted ${deleted} row(s) older than ${RAW_EVENTS_RETENTION_DAYS}d that already have a signal ` +
      `(cutoff ${cutoff}); scanned ${scanned}, left ${skippedNoSignal} un-classified orphan(s) for reconciliation`,
  );
  return {
    ok: true as const,
    table: "raw_events",
    deleted,
    scanned,
    skippedNoSignal,
  };
}

type HealthRetentionClient = {
  rpc: (
    fn: "prune_service_health_events",
    args: { p_cutoff: string; p_batch: number },
  ) => Promise<{ data: number | null; error: { message: string; code?: string } | null }>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runServiceHealthRetentionOnce(
  supabase?: HealthRetentionClient,
  sleep: (ms: number) => Promise<void> = defaultSleep,
) {
  const client: HealthRetentionClient = supabase ?? (getSupabaseAdmin() as unknown as HealthRetentionClient);
  const cutoff = daysAgoIso(SERVICE_HEALTH_RETENTION_DAYS);
  let deleted = 0;
  let batches = 0;

  for (let i = 0; i < SERVICE_HEALTH_MAX_BATCHES; i++) {
    batches = i + 1;
    const { data, error } = await client.rpc("prune_service_health_events", {
      p_cutoff: cutoff,
      p_batch: SERVICE_HEALTH_BATCH,
    });
    if (error) {
      if (error.code === "PGRST202") {
        console.error("[retention] prune_service_health_events function missing (PGRST202)");
        return { ok: false as const, table: "service_health_events", deleted, error: "prune function missing" };
      }
      console.error("[retention] service_health_events prune failed:", error.message);
      return { ok: false as const, table: "service_health_events", deleted, error: error.message };
    }
    const batchDeleted = data ?? 0;
    deleted += batchDeleted;
    if (batchDeleted < SERVICE_HEALTH_BATCH) break;
    if (i + 1 < SERVICE_HEALTH_MAX_BATCHES) await sleep(SERVICE_HEALTH_BATCH_PAUSE_MS);
  }

  console.log(
    `[retention] service_health_events: deleted ${deleted} row(s) older than ${SERVICE_HEALTH_RETENTION_DAYS}d (cutoff ${cutoff}), ${batches} batch(es)`,
  );
  return { ok: true as const, table: "service_health_events", deleted };
}

export async function runRetentionJobsOnce() {
  const prices = await runCommodityPricesRetentionOnce();
  const rawEvents = await runRawEventsRetentionOnce();
  return { prices, rawEvents };
}
