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

// Short keywords that can appear inside other words must match as whole words
// e.g. "war" should NOT match "anti-war protests 1970" or "tug-of-war"
const EXACT_WORD_KEYWORDS = new Set([
  "war", "oil", "gas", "bomb", "coup", "riot", "gold", "corn", "fed",
]);

export const HIGH_RELEVANCE_KEYWORDS = [
  // Conflict & Military
  "conflict", "missile", "explosion", "troops",
  "military strike", "military operation", "military action",
  "sanction", "blockade", "invasion", "airstrike", "ceasefire", "drone attack",
  "civil war", "armed forces", "navy", "warship",
  // Energy & Supply Chain
  "crude", "pipeline", "refinery", "opec", "hormuz", "energy crisis",
  // Economic Policy
  "tariff", "embargo", "trade war", "inflation", "rate decision",
  "central bank", "interest rate", "recession",
  // Geopolitical actors (specific countries in context means geopolitical)
  "iran", "russia", "ukraine", "taiwan", "israel", "hamas", "houthi",
  "nato", "nuclear", "geopolit", "escalation", "tension", "standoff",
  // Commodities
  "wheat", "grain", "copper", "commodity", "supply chain", "shortage",
  // Maritime
  "tanker", "suez", "red sea", "strait", "maritime",
];

// Words that cause false positives — explicit exclusions
export const EXCLUDE_KEYWORDS = [
  "sports", "football", "soccer", "fifa", "nfl", "nba", "olympics", "marathon",
  "celebrity", "music", "album", "concert", "movie", "film", "award", "oscar", "grammy",
  "weather", "tourism", "travel", "fashion", "lifestyle", "recipe", "cooking",
  "1970", "1971", "1972", "1973", "1974", "1975", "1976", "1977", "1978", "1979",
  "1980", "1981", "1982", "1983", "1984", "1985", "1986", "1987", "1988", "1989",
  "1990", "1991", "1992", "1993", "1994", "1995", "1996", "1997", "1998", "1999",
  "2000", "2001", "2002", "2003", "2004", "2005", // historical articles
  "tug-of-war", "war movie", "war film", "war game", "wargame", "star wars",
  "anti-war", "pre-war", "post-war", "cold war history",
  "oil painting", "gas prices for consumers", "natural gas pipeline repair",
  "bcci", "cricket", "ipl", "tennis", "golf", "basketball",
];

export function isRelevantEvent(title: string, summary: string = ""): boolean {
  const text = (title + " " + summary).toLowerCase();

  // Hard exclusion — if any exclude keyword is present, drop it
  if (EXCLUDE_KEYWORDS.some((kw) => text.includes(kw))) return false;

  // Exact-word keywords must appear as standalone words (not inside other words)
  for (const kw of EXACT_WORD_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(text)) return true;
  }

  // Phrase keywords use substring matching (they are already specific enough)
  return HIGH_RELEVANCE_KEYWORDS.some((kw) => text.includes(kw));
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
    const status = e.response?.status;
    // GDELT rate-limits aggressively — retry once after 30s
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
        event_date: eventDate,  // GDELT article seen date
      });

      if (!sigErr) signals += 1;
      else console.error("[GDELT] Signal insert error:", sigErr.message);
    } catch (e: any) {
      console.error("[GDELT] Classification/signal insert failed:", e.message);
    }
  }

  return { fetched, inserted, duplicates, filtered, signals };
}
