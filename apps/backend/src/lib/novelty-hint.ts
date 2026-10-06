import type { getSupabaseAdmin } from "../clients/supabase.js";
import { jaccardSimilarity, SIMILARITY_THRESHOLD, tokenize } from "../workers/signal-merge.js";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

const LOOKBACK_HOURS = 48;

/**
 * #139/#141 Step 5 — a cheap, existing-tooling novelty hint, NOT a semantic/
 * paraphrase duplicate detector (that is separate, larger, future work — see
 * signal-merge.ts's Jaccard-on-summaries approach for the closest thing that
 * exists today, and doc claude/85_..., Part 2.3, on why that threshold is
 * deliberately conservative).
 *
 * Before classifying a raw_event, check whether a signal with the same
 * country + event_type combination was already logged in the last 48 hours,
 * and pass that boolean into classifyEvent() as one real data point for
 * Claude's own "novelty" score — instead of judging novelty purely from the
 * article's own text with nothing to compare against.
 *
 * Known v1 limitation (intentional, documented per the task spec): a same
 * country+event_type match is a coarse proxy, not a same-story match — e.g.
 * every RSS/GNews article shares country="Global"/event_type="news", so this
 * hint will very often read "yes" for those two sources regardless of whether
 * the story is genuinely a repeat. It is still a real, cheap signal (ACLED and
 * GDELT carry a real country; Claude is told this is a coarse hint, not a
 * verdict) and is strictly better than giving Claude nothing to compare
 * against. Real duplicate/near-duplicate detection across paraphrased stories
 * is out of scope here.
 */
export async function hasSimilarRecentSignal(
  supabase: SupabaseAdmin,
  params: { country: string | null; eventType: string | null },
): Promise<boolean> {
  const { country, eventType } = params;
  if (!country && !eventType) return false;

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  let query = supabase
    .from("signals")
    .select("id", { count: "exact", head: true })
    .gte("created_at", cutoff);

  if (country) query = query.eq("country", country);
  if (eventType) query = query.eq("event_type", eventType);

  const { count, error } = await query;
  if (error) {
    // Best-effort — same discipline as recordServiceHealth: a broken hint query
    // must never block classification. "No evidence of a repeat" (false) is the
    // safe default on error, same direction novelty defaults when unknown.
    console.warn("[novelty-hint] hasSimilarRecentSignal query failed:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

type SignalTitleRow = { title: string | null; created_at: string | null };

/**
 * Title-level hint for RSS, GNews, GDELT, and reconciliation (2026-10-07).
 * hasSimilarRecentSignal stays for ACLED and the chart backfill, where country
 * is a real value. RSS and GNews rows have no country and every signal's event
 * type is "news", so that boolean was true for almost every article.
 *
 * SIMILARITY_THRESHOLD was tuned on summaries. Its use on titles is untested.
 * Every match is logged so it can be audited.
 */
export async function findSimilarRecentSignal(
  supabase: SupabaseAdmin,
  params: { title: string },
): Promise<{ title: string; hoursAgo: number; similarity: number } | null> {
  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("signals")
    .select("title, created_at")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    // Best-effort — same discipline as hasSimilarRecentSignal: a broken hint
    // query must never block classification. No match (null) is the safe default.
    console.warn("[novelty-hint] findSimilarRecentSignal query failed:", error.message);
    return null;
  }

  const incoming = tokenize(params.title);
  if (incoming.size === 0) return null;

  let best: { title: string; hoursAgo: number; similarity: number } | null = null;
  for (const row of (data ?? []) as SignalTitleRow[]) {
    if (!row.title) continue;
    const createdMs = new Date(row.created_at ?? "").getTime();
    if (!Number.isFinite(createdMs)) continue;
    const similarity = jaccardSimilarity(incoming, tokenize(row.title));
    // This constant was tuned on summaries; its use on titles is untested;
    // every match is logged so it can be audited.
    if (similarity < SIMILARITY_THRESHOLD) continue;
    if (best && similarity <= best.similarity) continue;
    const hoursAgo = Math.max(0, Math.round((Date.now() - createdMs) / 3_600_000));
    best = { title: row.title, hoursAgo, similarity };
  }
  return best;
}
