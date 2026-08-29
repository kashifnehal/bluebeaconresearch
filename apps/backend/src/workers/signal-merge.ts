import type { getSupabaseAdmin } from "../clients/supabase.js";
import type { ClassificationResult } from "../services/claude.service.js";
import { generateSignalAnalysis } from "./signal-generator.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";

/**
 * Cross-source signal merge. Runs AFTER classifyEvent() — classification is never
 * skipped for any article (see collectors). This only decides whether a freshly
 * *classified* article gets its own new `signals` row or gets folded into a recent
 * signal that independent classification says is plausibly the same real event.
 *
 * Thresholds tuned against real production `signals` data (2026-08-19 backtest, 500
 * most recent rows): same-event cross-source pairs (identical story, different outlet/
 * feed) cluster at Jaccard >= 0.6 even with real phrasing variance ("Kushner discusses
 * Gaza with Netanyahu" vs "Kushner sits with Netanyahu to talk Gaza" = 0.600). Below
 * ~0.45, same-region pairs start including genuinely different developments of a
 * multi-day story (e.g. an initial policy announcement vs. a same-topic follow-up
 * article ~13h later) rather than the same event — bias toward NOT merging (per task
 * restrictions) means the threshold sits above that ambiguous zone, not inside it.
 */
const MATCH_WINDOW_HOURS = 8;
const SIMILARITY_THRESHOLD = 0.55;
const CANDIDATE_LIMIT = 25;

const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "is", "are",
  "was", "were", "as", "by", "with", "from", "that", "this", "it", "its", "after",
  "over", "amid", "new", "says", "say", "said", "will", "has", "have", "had", "be",
  "been", "up", "down", "out", "into", "than", "more", "most", "not", "no", "but",
  "if", "while", "their", "his", "her",
]);

function tokenize(text: string | null | undefined): Set<string> {
  if (!text) return new Set();
  return new Set(
    text
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Founder decision (Prompt J.6, 2026-08-19): an escalation should re-alert
 * already-notified users — "a trader who acted on a severity-5 signal needs to know
 * it's now a 9" — but gated so minor severity refinements don't spam users who
 * already got the original alert. Fires on EITHER: the new severity crosses >=7 for
 * the first time (was below, now at/above), OR the jump is >=2 points in one go, even
 * if already at/above 7 (e.g. 7->9, 8->10). Literal spec as given: clause (b) also
 * fires on a jump that doesn't cross 7 at all (e.g. 3->5) — kept as-is, not narrowed,
 * per the task's explicit instruction not to second-guess it without checking first.
 */
const RE_ALERT_MIN_JUMP = 2;
const RE_ALERT_SEVERITY_THRESHOLD = 7;

function shouldReAlertOnEscalation(oldSeverity: number, newSeverity: number): boolean {
  const crossedThreshold = oldSeverity < RE_ALERT_SEVERITY_THRESHOLD && newSeverity >= RE_ALERT_SEVERITY_THRESHOLD;
  const bigJump = newSeverity - oldSeverity >= RE_ALERT_MIN_JUMP;
  return crossedThreshold || bigJump;
}

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

type CandidateSignal = {
  id: string;
  severity: number;
  sources_count: number | null;
  raw_event_ids: string[] | null;
  region: string | null;
  country: string | null;
  summary: string | null;
  event_date: string;
};

type MergeOutcome = "new" | "duplicate" | "escalation";

export type SourceFreshness = "realtime" | "cached";

export type InsertOrMergeParams = {
  supabase: SupabaseAdmin;
  collectorLabel: string;
  rawEventId: string;
  classification: ClassificationResult;
  title: string;
  eventType: string | null;
  eventDate: string;
  country: string;
  lat: number | null;
  lng: number | null;
  // "realtime" = RSS/GDELT (near-live); "cached" = GNews free tier, which surfaces
  // articles with up to ~12h lag (ADR 007). Only a realtime source may push a
  // merged signal's event_date forward — a cached source must never make an
  // already-tracked story look freshly-breaking. Defaults to "cached" (the
  // conservative choice: never advances a timestamp) if a caller omits it.
  freshness?: SourceFreshness;
};

export type InsertOrMergeResult = {
  signalId: string | null;
  outcome: MergeOutcome;
};

/**
 * Finds a plausible existing-signal match for an already-classified article. Returns
 * null (no match) whenever the region is missing/"global" (too broad a bucket to be a
 * useful match signal — confirmed live: "global" is the single largest region bucket
 * and mixes wholly unrelated stories) or nothing clears the similarity threshold.
 */
async function findMergeCandidate(
  supabase: SupabaseAdmin,
  classification: ClassificationResult,
  country: string,
  eventDate: string,
): Promise<(CandidateSignal & { similarity: number }) | null> {
  const region = (classification.region || "").trim();
  if (!region || region.toLowerCase() === "global") return null;

  const newEventTime = new Date(eventDate).getTime();
  if (Number.isNaN(newEventTime)) return null;
  const windowMs = MATCH_WINDOW_HOURS * 3_600_000;
  const lowerBound = new Date(newEventTime - windowMs).toISOString();
  const upperBound = new Date(newEventTime + windowMs).toISOString();

  // Exact (case-sensitive) region match only — deliberately not a fuzzy/ILIKE match.
  // A freeform AI-generated region string that differs slightly in casing/wording from
  // an existing signal's simply won't match, which just costs one extra Sonnet call on
  // a true duplicate — the safe failure direction per this task's bias-toward-caution
  // restriction, vs. a wildcard match risking an incorrect merge.
  const { data: candidates, error } = await supabase
    .from("signals")
    .select("id, severity, sources_count, raw_event_ids, region, country, summary, event_date")
    .eq("is_active", true)
    .eq("region", region)
    .gte("event_date", lowerBound)
    .lte("event_date", upperBound)
    .order("event_date", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (error || !candidates?.length) return null;

  const newTokens = tokenize(classification.summary);
  let best: (CandidateSignal & { similarity: number }) | null = null;

  for (const candidate of candidates as CandidateSignal[]) {
    // Extra safety: if both sides have a known (non-"Global") country and they differ,
    // this isn't the same event regardless of text similarity — skip.
    if (
      country &&
      country !== "Global" &&
      candidate.country &&
      candidate.country !== "Global" &&
      candidate.country !== country
    ) {
      continue;
    }

    const similarity = jaccardSimilarity(newTokens, tokenize(candidate.summary));
    if (similarity >= SIMILARITY_THRESHOLD && (!best || similarity > best.similarity)) {
      best = { ...candidate, similarity };
    }
  }

  return best;
}

/**
 * Inserts a new signal, or — if a plausible cross-source match is found — merges into
 * it as either a duplicate (severity <= existing, Sonnet skipped, existing ai_analysis
 * reused) or an escalation (severity > existing, severity updated, Sonnet regenerated
 * if the new severity crosses the same >=7 gate every other signal uses, and — gated
 * by `shouldReAlertOnEscalation()` above — already-notified users re-alerted with a
 * distinctly-labeled "UPDATED" message, not the original new-signal template).
 * Classification (the Haiku call) has already happened by the time this runs — this
 * function never decides whether to classify, only what to do with an
 * already-classified result.
 */
export async function insertOrMergeSignal(params: InsertOrMergeParams): Promise<InsertOrMergeResult> {
  const { supabase, collectorLabel, rawEventId, classification, title, eventType, eventDate, country, lat, lng } = params;
  const freshness: SourceFreshness = params.freshness ?? "cached";

  const match = await findMergeCandidate(supabase, classification, country, eventDate);

  if (!match) {
    const { data: sigInsert, error: sigErr } = await supabase
      .from("signals")
      .insert({
        raw_event_ids: [rawEventId],
        title,
        summary: classification.summary,
        severity: classification.severity,
        confidence: classification.confidence,
        event_type: eventType,
        country,
        region: classification.region,
        lat,
        lng,
        sources_count: 1,
        commodity_impacts: classification.commodityImpacts,
        is_breaking: classification.isBreaking,
        is_active: true,
        event_date: eventDate,
      })
      .select("id")
      .maybeSingle();

    if (sigErr || !sigInsert?.id) {
      console.error(`[${collectorLabel}] Signal insert error:`, sigErr?.message);
      return { signalId: null, outcome: "new" };
    }
    return { signalId: sigInsert.id as string, outcome: "new" };
  }

  const deltaHours = Math.abs(new Date(eventDate).getTime() - new Date(match.event_date).getTime()) / 3_600_000;
  const existingRawEventIds = match.raw_event_ids ?? [];
  const newRawEventIds = existingRawEventIds.includes(rawEventId)
    ? existingRawEventIds
    : [...existingRawEventIds, rawEventId];
  const newSourcesCount = (match.sources_count ?? 1) + 1;

  // Task 4 (ADR 007 enforcement): the merged signal's event_date only moves forward
  // when this contribution is from a realtime source (RSS/GDELT). A cached source
  // (GNews, ~12h surfacing lag) reporting a "newer" publish time must not make an
  // already-tracked story jump forward and read as freshly-breaking.
  const incomingIsNewer = new Date(eventDate).getTime() > new Date(match.event_date).getTime();
  const advanceEventDate = freshness === "realtime" && incomingIsNewer;
  const eventDatePatch = advanceEventDate ? { event_date: eventDate } : {};
  if (incomingIsNewer && !advanceEventDate) {
    console.log(
      `[${collectorLabel}] [SIGNAL-MERGE] keeping signal=${match.id} event_date ${match.event_date} — ` +
        `incoming ${eventDate} is newer but source is cached, not advancing`,
    );
  }

  if (classification.severity <= match.severity) {
    const { error: upErr } = await supabase
      .from("signals")
      .update({
        raw_event_ids: newRawEventIds,
        sources_count: newSourcesCount,
        updated_at: new Date().toISOString(),
        ...eventDatePatch,
      })
      .eq("id", match.id);

    if (upErr) {
      console.error(`[${collectorLabel}] [SIGNAL-MERGE:duplicate] update failed for signal ${match.id}:`, upErr.message);
      return { signalId: null, outcome: "new" };
    }

    console.log(
      `[${collectorLabel}] [SIGNAL-MERGE:duplicate] rawEvent=${rawEventId} -> signal=${match.id} ` +
        `similarity=${match.similarity.toFixed(3)} deltaHours=${deltaHours.toFixed(2)} ` +
        `severity(new=${classification.severity},existing=${match.severity}) region=${classification.region} sourcesCount=${newSourcesCount}`,
    );
    return { signalId: match.id, outcome: "duplicate" };
  }

  // Escalation: new classification's severity is strictly higher.
  const { error: upErr } = await supabase
    .from("signals")
    .update({
      severity: classification.severity,
      raw_event_ids: newRawEventIds,
      sources_count: newSourcesCount,
      updated_at: new Date().toISOString(),
      ...eventDatePatch,
    })
    .eq("id", match.id);

  if (upErr) {
    console.error(`[${collectorLabel}] [SIGNAL-MERGE:escalation] update failed for signal ${match.id}:`, upErr.message);
    return { signalId: null, outcome: "new" };
  }

  const oldSeverity = match.severity;
  const newSeverity = classification.severity;
  const reAlert = shouldReAlertOnEscalation(oldSeverity, newSeverity);
  const logTag = reAlert ? "SIGNAL-MERGE:escalation-realerted" : "SIGNAL-MERGE:escalation";

  console.log(
    `[${collectorLabel}] [${logTag}] rawEvent=${rawEventId} -> signal=${match.id} ` +
      `similarity=${match.similarity.toFixed(3)} deltaHours=${deltaHours.toFixed(2)} ` +
      `severity ${oldSeverity} -> ${newSeverity} region=${classification.region} sourcesCount=${newSourcesCount}`,
  );

  if (newSeverity >= 7) {
    try {
      await generateSignalAnalysis(match.id);
      console.log(`[${collectorLabel}] [${logTag}] briefing regenerated for signal ${match.id}`);
    } catch (e) {
      console.error(
        `[${collectorLabel}] [${logTag}] briefing regeneration failed for signal ${match.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Idempotency: reuses the same guarantee the original new-signal dispatch already
  // relies on — dispatchAlertsForSignal is called at most once per triggering DB
  // write, never on a re-read/retry loop. No separate "already alerted" table/flag is
  // introduced. This is safe here for the same reason it's safe for new signals: the
  // re-alert condition is evaluated against the signal's severity *before* this
  // update landed (`match.severity`, read once above), so a given real severity jump
  // can only ever be classified as crossing the threshold once — once the update
  // lands, the next read of this signal reflects the new severity, so a later
  // same-or-lower-severity article hits the duplicate branch instead, not escalation.
  if (reAlert) {
    try {
      const dispatchResult = await dispatchAlertsForSignal(match.id, { oldSeverity, newSeverity });
      console.log(`[${collectorLabel}] [${logTag}] alert dispatched for signal ${match.id}:`, dispatchResult);
    } catch (e) {
      console.error(
        `[${collectorLabel}] [${logTag}] alert dispatch failed for signal ${match.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { signalId: match.id, outcome: "escalation" };
}
