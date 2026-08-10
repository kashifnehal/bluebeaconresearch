import axios from "axios";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";

type GdeltArticle = {
  url?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
};

export const HIGH_RELEVANCE_KEYWORDS = [
  // Conflict & Military
  "war", "conflict", "attack", "strike", "missile", "bomb", "explosion", "troops",
  "military", "sanction", "blockade", "invasion", "offensive", "airstrike", "ceasefire",
  // Energy & Supply Chain
  "oil", "crude", "gas", "pipeline", "refinery", "opec", "hormuz", "energy", "fuel",
  // Economic Policy
  "tariff", "sanction", "embargo", "trade war", "inflation", "fed", "rate decision",
  "central bank", "interest rate", "cpi", "gdp", "recession",
  // Geopolitical
  "iran", "russia", "ukraine", "china", "taiwan", "israel", "hamas", "houthi",
  "nato", "nuclear", "coup", "protest", "riot", "civil war", "tension",
  // Commodities
  "wheat", "grain", "food", "gold", "copper", "commodity", "shortage", "supply chain",
  // Maritime
  "shipping", "tanker", "suez", "malacca", "red sea", "vessel", "port"
];

export const EXCLUDE_KEYWORDS = [
  "sports", "football", "soccer", "fifa", "nfl", "nba", "olympics", "marathon",
  "celebrity", "music", "movie", "film", "award", "oscar", "grammy",
  "weather", "tourism", "travel", "fashion", "lifestyle", "recipe", "cooking"
];

export function isRelevantEvent(title: string, summary: string = ""): boolean {
  const text = (title + " " + summary).toLowerCase();
  const hasExcludeWord = EXCLUDE_KEYWORDS.some((kw) => text.includes(kw));
  if (hasExcludeWord) return false;
  const hasRelevantWord = HIGH_RELEVANCE_KEYWORDS.some((kw) => text.includes(kw));
  return hasRelevantWord;
}

const claude = new ClaudeService();

// GDELT GKG/Doc API — the correct active endpoint for article-level search
const GDELT_API_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=conflict+OR+war+OR+sanctions+OR+military+OR+oil&mode=artlist&maxrecords=50&format=json&sort=DateDesc";

export async function runGdeltCollectorOnce() {
  const supabase = getSupabaseAdmin();

  let res: any;
  try {
    res = await axios.get(GDELT_API_URL, { timeout: 25_000 });
  } catch (e: any) {
    console.error("[GDELT] Fetch failed:", e.message);
    return { fetched: 0, inserted: 0, duplicates: 0, filtered: 0, signals: 0, error: e.message };
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

    // Classify and write signal directly — reliable even when Redis/BullMQ is unavailable
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
      });

      if (!sigErr) signals += 1;
      else console.error("[GDELT] Signal insert error:", sigErr.message);
    } catch (e: any) {
      console.error("[GDELT] Classification/signal insert failed:", e.message);
    }
  }

  return { fetched, inserted, duplicates, filtered, signals };
}
