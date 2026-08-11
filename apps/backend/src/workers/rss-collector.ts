import Parser from "rss-parser";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { isRelevantEvent } from "./gdelt-collector.js";

const claude = new ClaudeService();
const parser = new Parser({ timeout: 20_000 });

// Free, no-auth-required RSS feeds that update every 5–15 minutes
// These provide TRULY CURRENT news (within the last hour) unlike GNews free tier
const RSS_FEEDS = [
  // BBC World
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", label: "BBC World" },
  // Al Jazeera (strong geopolitical coverage, updates every 10-15m)
  { url: "https://www.aljazeera.com/xml/rss/all.xml", label: "Al Jazeera" },
  // NPR World
  { url: "https://feeds.npr.org/1004/rss.xml", label: "NPR World" },
  // France24 International
  { url: "https://www.france24.com/en/rss", label: "France24" },
  // DW World (Deutsche Welle)
  { url: "https://rss.dw.com/rdf/rss-en-world", label: "DW World" },
  // OilPrice.com (Energy & Oil geopolitics)
  { url: "https://oilprice.com/rss/main", label: "OilPrice" },
  // The Guardian - World
  { url: "https://www.theguardian.com/world/rss", label: "Guardian World" },
  // Reuters (feeds.reuters.com DNS fails on some hosts — use agency redirect target)
  { url: "https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best", label: "Reuters" },
  // UN News (geopolitics, sanctions, conflict)
  { url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", label: "UN News" },
];


export async function runRssCollectorOnce() {
  const supabase = getSupabaseAdmin();

  const allItems: { title: string; summary: string; url: string; pubDate: string; label: string }[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items ?? []) {
        if (!item.link || !item.title) continue;
        const pubDate = item.isoDate || item.pubDate
          ? new Date(item.isoDate ?? item.pubDate ?? "").toISOString()
          : new Date().toISOString();

        // Skip articles older than 12 hours (was 4h — too aggressive, missed afternoon articles)
        if (Date.now() - new Date(pubDate).getTime() > 12 * 60 * 60 * 1000) continue;

        allItems.push({
          title: item.title.slice(0, 280),
          summary: (item.contentSnippet || item.content || item.summary || "").slice(0, 1000),
          url: item.link,
          pubDate,
          label: feed.label,
        });
      }
      await new Promise((r) => setTimeout(r, 200));
    } catch (e: any) {
      console.warn(`[RSS] Feed "${feed.label}" failed:`, e.message);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const items = allItems.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  let fetched = items.length;
  let inserted = 0;
  let duplicates = 0;
  let filtered = 0;
  let signals = 0;

  for (const item of items) {
    if (!isRelevantEvent(item.title, item.summary)) {
      filtered++;
      continue;
    }

    const externalId = `rss-${Buffer.from(item.url).toString("base64").slice(0, 32)}`;

    const existing = await supabase
      .from("raw_events")
      .select("id")
      .eq("external_id", externalId)
      .maybeSingle();

    if (existing.data?.id) {
      duplicates++;
      continue;
    }

    const rawEventPayload = {
      source: "newsapi" as const,
      external_id: externalId,
      title: item.title,
      summary: item.summary || null,
      country: null,
      lat: null,
      lng: null,
      event_type: "news",
      event_date: item.pubDate,
      raw_data: { url: item.url, source: item.label },
    };

    const insert = await supabase
      .from("raw_events")
      .insert(rawEventPayload)
      .select("id")
      .maybeSingle();

    if (insert.error || !insert.data?.id) {
      console.error("[RSS] raw_events insert error:", insert.error?.message);
      continue;
    }
    inserted++;

    const rawEventId = insert.data.id as string;

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
        event_date: rawEventPayload.event_date,
      });

      if (!sigErr) signals++;
      else console.error("[RSS] Signal insert error:", sigErr.message);
    } catch (e: any) {
      console.error("[RSS] Classification/signal insert failed:", e.message);
    }
  }

  return { fetched, inserted, duplicates, filtered, signals };
}
