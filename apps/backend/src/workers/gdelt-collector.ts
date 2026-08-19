import axios from "axios";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { isRelevantEvent } from "../lib/relevance-filter.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";
import { generateSignalAnalysis } from "./signal-generator.js";
import { insertOrMergeSignal } from "./signal-merge.js";

// Re-export for backward compatibility
export { isRelevantEvent, shouldExclude, HIGH_RELEVANCE_KEYWORDS, EXCLUDE_KEYWORDS, GEOPOLITICAL_KEYWORDS, MARKET_FINANCE_KEYWORDS } from "../lib/relevance-filter.js";

type GdeltArticle = {
  url?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
};

const claude = new ClaudeService();

// Expanded query: geopolitical + markets/finance/macroeconomics
// sourcelang:eng — product is English-first (see 10_DECISIONS.md); without this,
// GDELT's global query returns articles in whatever language the source published in
// (confirmed live: Azerbaijani and French titles reaching the feed unfiltered).
const GDELT_API_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=(conflict+OR+war+OR+sanctions+OR+military+OR+oil+OR+stock+market+OR+trade+OR+inflation+OR+fed+OR+earnings)+sourcelang:eng&mode=artlist&maxrecords=50&format=json&sort=DateDesc";

export async function runGdeltCollectorOnce() {
  const supabase = getSupabaseAdmin();

  let res: any;
  try {
    res = await axios.get(GDELT_API_URL, { timeout: 25_000 });
  } catch (e: any) {
    const status = e.response?.status;
    if (status === 429) {
      console.warn("[GDELT] Rate limited (429), retrying in 30s...");
      await new Promise((r) => setTimeout(r, 30_000));
      try {
        res = await axios.get(GDELT_API_URL, { timeout: 25_000 });
      } catch (retryErr: any) {
        console.error("[GDELT] Retry failed:", retryErr.message);
        return { fetched: 0, inserted: 0, duplicates: 0, filtered: 0, signals: 0, error: retryErr.message };
      }
    } else {
      console.error("[GDELT] Fetch failed:", e.message);
      return { fetched: 0, inserted: 0, duplicates: 0, filtered: 0, signals: 0, error: e.message };
    }
  }

  const articles: GdeltArticle[] = res.data?.articles ?? [];

  let fetched = articles.length;
  let inserted = 0;
  let duplicates = 0;
  let filtered = 0;
  let signals = 0;

  for (const a of articles) {
    const externalId = a.url ? `gdelt-${Buffer.from(a.url).toString("base64").slice(0, 32)}` : null;
    if (!externalId) continue;

    const title = a.title?.slice(0, 280) ?? a.url ?? "GDELT article";

    // Defense-in-depth behind the sourcelang:eng query filter above — GDELT's query-level
    // language filter isn't always exhaustive, and the article's own `language` field
    // (when present) is a more direct signal than guessing from title characters.
    if (a.language && a.language.toLowerCase() !== "english") {
      filtered += 1;
      continue;
    }

    if (!isRelevantEvent(title)) {
      filtered += 1;
      continue;
    }

    const existing = await supabase.from("raw_events").select("id").eq("external_id", externalId).maybeSingle();
    if (existing.data?.id) {
      duplicates += 1;
      continue;
    }

    const eventDate = a.seendate
      ? new Date(
          a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z")
        ).toISOString()
      : new Date().toISOString();

    const country = a.sourcecountry ?? null;

    const insert = await supabase
      .from("raw_events")
      .insert({
        source: "gdelt",
        external_id: externalId,
        title,
        summary: null,
        country,
        lat: null,
        lng: null,
        event_type: "news",
        event_date: eventDate,
        raw_data: a,
      })
      .select("id")
      .maybeSingle();

    if (insert.error || !insert.data?.id) continue;
    inserted += 1;

    const rawEventId = insert.data.id as string;

    try {
      const classification = await claude.classifyEvent({
        id: rawEventId,
        title,
        country,
        event_type: "news",
        event_date: eventDate,
      });

      const mergeResult = await insertOrMergeSignal({
        supabase,
        collectorLabel: "GDELT",
        rawEventId,
        classification,
        title,
        eventType: "news",
        eventDate,
        country: formatCountryName(country),
        lat: null,
        lng: null,
      });

      // Dispatch + briefing generation inline — bypass the queue for both, same as
      // classification above, since nothing feeds either dormant BullMQ queue. Only
      // for genuinely new signals: a duplicate merge reuses the existing signal's
      // ai_analysis and skips Sonnet/dispatch entirely; an escalation regenerates the
      // briefing itself (gated on the new severity, inside insertOrMergeSignal) but
      // conditionally re-dispatches a distinctly-labeled "UPDATED" alert on a
      // threshold-crossing escalation (see shouldReAlertOnEscalation() in
      // signal-merge.ts) — that dispatch happens inside insertOrMergeSignal itself,
      // not here, so it isn't duplicated across all 3 collectors.
      if (mergeResult.outcome === "new" && mergeResult.signalId) {
        signals += 1;
        if (classification.severity >= 7) {
          try {
            await generateSignalAnalysis(mergeResult.signalId);
            console.log(`[GDELT] signal-generation completed for signal ${mergeResult.signalId}`);
          } catch (e) {
            console.error(`[GDELT] signal-generation failed for signal ${mergeResult.signalId}:`, e instanceof Error ? e.message : e);
          }
        }
        try {
          const dispatchResult = await dispatchAlertsForSignal(mergeResult.signalId);
          console.log(`[GDELT] alert-dispatch for signal ${mergeResult.signalId}:`, dispatchResult);
        } catch (e) {
          console.error(`[GDELT] alert-dispatch failed for signal ${mergeResult.signalId}:`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e: any) {
      console.error("[GDELT] Classification/signal insert failed:", e.message);
    }
  }

  return { fetched, inserted, duplicates, filtered, signals };
}
