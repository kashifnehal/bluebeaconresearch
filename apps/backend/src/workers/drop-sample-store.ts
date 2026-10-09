import { createHash } from "node:crypto";
import type { getSupabaseAdmin } from "../clients/supabase.js";
import type { FeedTier } from "../lib/relevance-filter.js";

export type DropRecord = {
  feed: string;
  tier: FeedTier;
  reason: string;
  title: string;
  summary?: string;
  url?: string;
  shadowGroups?: string[];
  midwordOnly?: boolean;
};

const MAX_ROWS_PER_CYCLE = 200;
const SUMMARY_EXCERPT_MAX_CHARS = 300;

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleHash(title: string): string {
  return createHash("sha1").update(normalizeTitle(title)).digest("hex");
}

/**
 * Persists a sample of this cycle's relevance-filter drops into
 * internal_ops.rss_drop_samples, behind the DROP_SAMPLE_STORE env flag
 * (default off — this is a diagnostic store, not part of the ingestion
 * decision path). Never throws: ingestion must never fail because of this.
 * No-ops quietly if the table doesn't exist yet (migration not applied) or
 * the flag is off.
 */
export async function recordDrops(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  drops: DropRecord[],
): Promise<void> {
  if (process.env.DROP_SAMPLE_STORE !== "true") return;
  if (drops.length === 0) return;

  try {
    const nowIso = new Date().toISOString();
    for (const drop of drops.slice(0, MAX_ROWS_PER_CYCLE)) {
      const hash = titleHash(drop.title);
      const row = {
        feed: drop.feed,
        tier: drop.tier,
        reason: drop.reason,
        shadow_groups: drop.shadowGroups && drop.shadowGroups.length > 0 ? drop.shadowGroups : null,
        midword_only: drop.midwordOnly ?? false,
        title: drop.title,
        summary_excerpt: drop.summary ? drop.summary.slice(0, SUMMARY_EXCERPT_MAX_CHARS) : null,
        url: drop.url ?? null,
        title_hash: hash,
        last_seen_at: nowIso,
      };

      const insert = await (supabase as any)
        .schema("internal_ops")
        .from("rss_drop_samples")
        .insert({ ...row, first_seen_at: nowIso, seen_count: 1 });

      if (insert.error?.code === "23505") {
        // Already seen this (feed, title_hash) — bump seen_count/last_seen_at instead.
        const existing = await (supabase as any)
          .schema("internal_ops")
          .from("rss_drop_samples")
          .select("seen_count")
          .eq("feed", drop.feed)
          .eq("title_hash", hash)
          .maybeSingle();
        const nextSeenCount = (existing.data?.seen_count ?? 1) + 1;
        await (supabase as any)
          .schema("internal_ops")
          .from("rss_drop_samples")
          .update({ last_seen_at: nowIso, seen_count: nextSeenCount, reason: row.reason })
          .eq("feed", drop.feed)
          .eq("title_hash", hash);
      } else if (insert.error) {
        // Table missing (migration not applied) or any other error — log once and
        // stop for this cycle; ingestion itself must never fail from this path.
        console.warn("[DROP-SAMPLE-STORE] insert failed, skipping rest of cycle:", insert.error.message);
        return;
      }
    }
  } catch (e) {
    console.warn("[DROP-SAMPLE-STORE] recordDrops failed:", e instanceof Error ? e.message : e);
  }
}
