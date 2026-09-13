import type { getSupabaseAdmin } from "../clients/supabase.js";

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
