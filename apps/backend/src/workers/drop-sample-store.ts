import { createHash } from "node:crypto";
import type { getSupabaseAdmin } from "../clients/supabase.js";
import {
  findExcludeMatch,
  isMidwordOnlyMatch,
  isRoutineMarketNoise,
  shouldExclude,
  type FeedTier,
} from "../lib/relevance-filter.js";
import { matchShadowGroups } from "../lib/shadow-terms.js";

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
const RETENTION_DAYS = 14;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

let lastPurgeAt = 0;

/** Test-only: reset the once-per-hour purge timestamp. */
export function __resetPurgeStateForTests(): void {
  lastPurgeAt = 0;
}

/**
 * The relevance-drop decision for one headline, extracted from the RSS collector so
 * GNews/GDELT can log the same way. Same reason strings and same functions as the
 * RSS block; call only for a headline isRelevantEvent() already dropped. Never
 * changes a keep/drop decision.
 */
export function classifyDrop(
  title: string,
  summary: string,
  tier: FeedTier,
): { reason: string; detail?: string; shadowGroups?: string[]; midwordOnly?: boolean } {
  void tier;
  if (shouldExclude(title, summary)) {
    const match = findExcludeMatch(title, summary);
    return {
      reason: "exclude-phrase",
      detail: match ? `${match.phrase}@${match.location}` : undefined,
      midwordOnly: false,
    };
  }
  if (isRoutineMarketNoise(title)) return { reason: "noise", midwordOnly: false };
  const combined = `${title} ${summary}`;
  return {
    reason: "nokeyword",
    shadowGroups: matchShadowGroups(combined),
    midwordOnly: isMidwordOnlyMatch(combined),
  };
}

/**
 * Recording rule for GNews/GDELT drops: always keep a nokeyword drop that matched a
 * shadow term group; otherwise keep with probability `backgroundRate`.
 */
export function shouldRecordDrop(
  rec: Pick<DropRecord, "reason" | "shadowGroups">,
  rand: () => number,
  backgroundRate: number,
): boolean {
  if (rec.reason === "nokeyword" && (rec.shadowGroups?.length ?? 0) > 0) return true;
  return rand() < backgroundRate;
}

/** Builds a DropRecord for a GNews/GDELT relevance drop (reason string matches the RSS block's). */
export function buildDropRecord(
  feed: string,
  tier: FeedTier,
  title: string,
  summary: string,
  url: string | undefined,
): DropRecord {
  const c = classifyDrop(title, summary, tier);
  return {
    feed,
    tier,
    reason: c.detail ? `exclude:${c.detail}` : c.reason,
    title,
    summary,
    url,
    shadowGroups: c.shadowGroups,
    midwordOnly: c.midwordOnly,
  };
}

/**
 * Used by the GNews/GDELT relevance-drop blocks: does nothing unless
 * DROP_SAMPLE_STORE === "true"; otherwise builds the record and pushes it when
 * shouldRecordDrop() says so. Never throws.
 */
export function collectRelevanceDrop(
  records: DropRecord[],
  feed: string,
  title: string,
  summary: string,
  url: string | undefined,
  backgroundRate: number,
  rand: () => number = Math.random,
): void {
  if (process.env.DROP_SAMPLE_STORE !== "true") return;
  try {
    const rec = buildDropRecord(feed, "world", title, summary, url);
    if (shouldRecordDrop(rec, rand, backgroundRate)) records.push(rec);
  } catch (e) {
    console.warn("[DROP-SAMPLE-STORE] collectRelevanceDrop failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Deletes rows not seen for 14 days. At most once per hour per process; never throws.
 */
export async function purgeOldDropSamples(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<void> {
  const now = Date.now();
  if (now - lastPurgeAt < PURGE_INTERVAL_MS) return;
  lastPurgeAt = now;
  try {
    const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const res = await (supabase as any).from("rss_drop_samples").delete().lt("last_seen_at", cutoff);
    if (res?.error) console.warn("[DROP-SAMPLE-STORE] purge failed:", res.error.message);
  } catch (e) {
    console.warn("[DROP-SAMPLE-STORE] purge failed:", e instanceof Error ? e.message : e);
  }
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleHash(title: string): string {
  return createHash("sha1").update(normalizeTitle(title)).digest("hex");
}

/**
 * Persists a sample of this cycle's relevance-filter drops into
 * public.rss_drop_samples, behind the DROP_SAMPLE_STORE env flag
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

  await purgeOldDropSamples(supabase);

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
        .from("rss_drop_samples")
        .insert({ ...row, first_seen_at: nowIso, seen_count: 1 });

      if (insert.error?.code === "23505") {
        // Already seen this (feed, title_hash) — bump seen_count/last_seen_at instead.
        const existing = await (supabase as any)
            .from("rss_drop_samples")
          .select("seen_count")
          .eq("feed", drop.feed)
          .eq("title_hash", hash)
          .maybeSingle();
        const nextSeenCount = (existing.data?.seen_count ?? 1) + 1;
        await (supabase as any)
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
