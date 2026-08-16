import axios from "axios";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { isRelevantEvent } from "../lib/relevance-filter.js";

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

      const { error: sigErr } = await supabase.from("signals").insert({
        raw_event_ids: [rawEventId],
        title,
        summary: classification.summary,
        severity: classification.severity,
        confidence: classification.confidence,
        event_type: "news",
        country: formatCountryName(country),
        region: classification.region,
        lat: null,
        lng: null,
        sources_count: 1,
        commodity_impacts: classification.commodityImpacts,
        is_breaking: classification.isBreaking,
        is_active: true,
        event_date: eventDate,
      });

      if (!sigErr) signals += 1;
      else console.error("[GDELT] Signal insert error:", sigErr.message);
    } catch (e: any) {
      console.error("[GDELT] Classification/signal insert failed:", e.message);
    }
  }

  return { fetched, inserted, duplicates, filtered, signals };
}
