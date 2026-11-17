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

/** PostgREST `.or()` filter-string quoting: wrap in double quotes, doubling
 *  any internal one, so a feed name containing a comma/paren/space can't
 *  break the filter. `feed` comes from static collector config, not user
 *  input, but this costs nothing and removes the need to trust that. */
function pgFilterValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

type PendingDrop = {
  feed: string;
  hash: string;
  occurrences: number;
  row: Record<string, unknown>;
};

/**
 * Persists a sample of this cycle's relevance-filter drops into
 * public.rss_drop_samples, behind the DROP_SAMPLE_STORE env flag
 * (default off — this is a diagnostic store, not part of the ingestion
 * decision path). Never throws: ingestion must never fail because of this.
 * No-ops quietly if the table doesn't exist yet (migration not applied) or
 * the flag is off.
 *
 * One batched select resolves which (feed, title_hash) pairs already exist
 * (87% of this table's Postgres log errors, 2026-11-16/17, were duplicate-key
 * errors from the old insert-first-then-catch-23505 approach — every repeat
 * headline wrote an error line into the database log). Rows that already
 * exist get an UPDATE (never conflicts); rows that don't are inserted in one
 * batched call. If that batched insert still hits 23505 — two workers raced
 * on the same pair between our select and insert — it's swallowed quietly,
 * same as before.
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
    const batch = drops.slice(0, MAX_ROWS_PER_CYCLE);

    // Collapse same (feed, title_hash) pairs seen more than once in this
    // cycle's own batch before ever touching the database, so a repeat
    // headline within one cycle can't self-conflict on the batched insert.
    const pending = new Map<string, PendingDrop>();
    for (const drop of batch) {
      const hash = titleHash(drop.title);
      const key = `${drop.feed}\u0000${hash}`;
      const already = pending.get(key);
      if (already) {
        already.occurrences += 1;
        continue;
      }
      pending.set(key, {
        feed: drop.feed,
        hash,
        occurrences: 1,
        row: {
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
        },
      });
    }

    const orFilter = [...pending.values()]
      .map((p) => `and(feed.eq.${pgFilterValue(p.feed)},title_hash.eq.${pgFilterValue(p.hash)})`)
      .join(",");
    const existingRes = await (supabase as any)
      .from("rss_drop_samples")
      .select("feed, title_hash, seen_count")
      .or(orFilter);
    if (existingRes.error) {
      // Table missing (migration not applied) or any other error — log once and
      // stop for this cycle; ingestion itself must never fail from this path.
      console.warn("[DROP-SAMPLE-STORE] batched select failed, skipping this cycle:", existingRes.error.message);
      return;
    }
    const existingSeenCounts = new Map<string, number>();
    for (const row of existingRes.data ?? []) {
      existingSeenCounts.set(`${row.feed}\u0000${row.title_hash}`, row.seen_count ?? 1);
    }

    const toInsert: Record<string, unknown>[] = [];
    for (const [key, p] of pending) {
      const existingSeenCount = existingSeenCounts.get(key);
      if (existingSeenCount === undefined) {
        toInsert.push({ ...p.row, first_seen_at: nowIso, seen_count: p.occurrences });
        continue;
      }
      const update = await (supabase as any)
        .from("rss_drop_samples")
        .update({
          last_seen_at: nowIso,
          seen_count: existingSeenCount + p.occurrences,
          reason: p.row.reason,
        })
        .eq("feed", p.feed)
        .eq("title_hash", p.hash);
      if (update.error) {
        console.warn("[DROP-SAMPLE-STORE] update failed, skipping rest of cycle:", update.error.message);
        return;
      }
    }

    if (toInsert.length > 0) {
      const insertRes = await (supabase as any).from("rss_drop_samples").insert(toInsert);
      if (insertRes.error && insertRes.error.code !== "23505") {
        console.warn("[DROP-SAMPLE-STORE] insert failed, skipping rest of cycle:", insertRes.error.message);
      }
      // A 23505 here means another worker inserted one of these same (feed,
      // title_hash) pairs between our select and this insert — swallow
      // quietly, same as the old insert-first approach already did.
    }
  } catch (e) {
    console.warn("[DROP-SAMPLE-STORE] recordDrops failed:", e instanceof Error ? e.message : e);
  }
}
