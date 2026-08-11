import axios from "axios";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { getEnv } from "../env.js";
import { isRelevantEvent } from "./gdelt-collector.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";

const claude = new ClaudeService();

// Free tier: 1 query only (~96 req/day at 15-min intervals). Add more when on GNews Basic.
const GNEWS_QUERIES = [
  "conflict OR war OR sanctions OR military OR oil OR geopolitics",
];

async function fetchGnewsArticles(query: string, token: string) {
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&sortby=publishedAt&token=${token}`;
  const res = await axios.get(url, { timeout: 20_000 });
  return (res.data?.articles ?? []) as any[];
}

export async function runGnewsCollectorOnce() {
  const env = getEnv();
  if (!env.NEWS_API_KEY) return { error: "NEWS_API_KEY missing" };

  const supabase = getSupabaseAdmin();

  // Run all queries (parallel would hit rate limits; run sequentially with 300ms gap)
  const allArticles: any[] = [];
  for (const query of GNEWS_QUERIES) {
    try {
      const articles = await fetchGnewsArticles(query, env.NEWS_API_KEY);
      allArticles.push(...articles);
    } catch (e: any) {
      // If we hit GNews rate limit (402), fall back to single query mode
      if (e.response?.status === 402 || e.response?.status === 429) {
        console.warn("[GNews] Rate limit hit, skipping additional queries");
        break;
      }
      console.warn(`[GNews] Query "${query}" failed:`, e.message);
    }
    // Small gap to be respectful of rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  // Deduplicate by URL before processing
  const seen = new Set<string>();
  const articles = allArticles.filter((a) => {
    if (!a.url || seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  let fetched = articles.length;
  let inserted = 0;
  let duplicates = 0;
  let filtered = 0;
  let signals = 0;

  for (const a of articles) {
    const externalId = a.url ? `gnews-${Buffer.from(a.url).toString("base64").slice(0, 32)}` : null;
    if (!externalId) continue;

    const title = a.title?.slice(0, 280) ?? "GNews article";
    const summary = a.description?.slice(0, 1000) ?? "";
    if (!isRelevantEvent(title, summary)) {
      filtered += 1;
      continue;
    }

    const existing = await supabase.from("raw_events").select("id").eq("external_id", externalId).maybeSingle();
    if (existing.data?.id) {
      duplicates += 1;
      continue;
    }

    const rawEventPayload = {
      source: "newsapi",  // DB constraint allows: gdelt, acled, newsapi — gnews maps to newsapi
      external_id: externalId,
      title: a.title?.slice(0, 280) ?? "GNews article",
      summary: a.description?.slice(0, 1000) ?? null,
      country: null,
      lat: null,
      lng: null,
      event_type: "news",
      event_date: a.publishedAt ?? new Date().toISOString(),  // article publish time
      raw_data: a,
    };

    const insert = await supabase.from("raw_events").insert(rawEventPayload).select("id").maybeSingle();

    if (insert.error || !insert.data?.id) {
      console.error("[GNews] raw_events insert error:", insert.error?.message);
      continue;
    }
    inserted += 1;

    const rawEventId = insert.data.id as string;

    // Classify and write signal directly — reliable even when Redis/BullMQ is unavailable
    try {
      const classification = await claude.classifyEvent({
        id: rawEventId,
        title: rawEventPayload.title,
        summary: rawEventPayload.summary ?? "",
        country: rawEventPayload.country,
        event_type: rawEventPayload.event_type,
        event_date: rawEventPayload.event_date,
      });

      const { error: sigErr } = await supabase.from("signals").insert({
        raw_event_ids: [rawEventId],
        title: rawEventPayload.title,
        summary: classification.summary,
        severity: classification.severity,
        confidence: classification.confidence,
        event_type: rawEventPayload.event_type,
        country: formatCountryName(null),
        region: classification.region,
        lat: null,
        lng: null,
        sources_count: 1,
        commodity_impacts: classification.commodityImpacts,
        is_breaking: classification.isBreaking,
        is_active: true,
        event_date: rawEventPayload.event_date,  // article publish time shown in UI
      });

      if (!sigErr) signals += 1;
      else console.error("[GNews] Signal insert error:", sigErr.message);
    } catch (e: any) {
      console.error("[GNews] Classification/signal insert failed:", e.message);
    }
  }

  return { fetched, inserted, duplicates, filtered, signals };
}
