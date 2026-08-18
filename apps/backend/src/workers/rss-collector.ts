import Parser from "rss-parser";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { resolveGeoCoords } from "../lib/geo-resolver.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { isRelevantEvent, type FeedTier } from "../lib/relevance-filter.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";
import { generateSignalAnalysis } from "./signal-generator.js";

const claude = new ClaudeService();
const parser = new Parser({ timeout: 20_000 });

/** Max article age — 4h window per product requirement for market-moving news */
const MAX_ARTICLE_AGE_MS = 4 * 60 * 60 * 1000;

type RssFeed = { url: string; label: string; tier: FeedTier };

const RSS_FEEDS: RssFeed[] = [
  // ── World / geopolitical ──
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", label: "BBC World", tier: "world" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", label: "Al Jazeera", tier: "world" },
  { url: "https://feeds.npr.org/1004/rss.xml", label: "NPR World", tier: "world" },
  { url: "https://www.france24.com/en/rss", label: "France24", tier: "world" },
  { url: "https://rss.dw.com/rdf/rss-en-world", label: "DW World", tier: "world" },
  { url: "https://www.theguardian.com/world/rss", label: "Guardian World", tier: "world" },
  { url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", label: "UN News", tier: "world" },
  // ── Finance / markets (lighter filter — only hard-exclude sports/celebrity) ──
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", label: "BBC Business", tier: "finance" },
  { url: "https://www.theguardian.com/business/rss", label: "Guardian Business", tier: "finance" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", label: "NYT Business", tier: "finance" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", label: "MarketWatch", tier: "finance" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", label: "WSJ Markets", tier: "finance" },
  { url: "https://www.investing.com/rss/news.rss", label: "Investing.com", tier: "finance" },
  { url: "https://oilprice.com/rss/main", label: "OilPrice", tier: "finance" },
];

export async function runRssCollectorOnce() {
  const supabase = getSupabaseAdmin();

  const allItems: { title: string; summary: string; url: string; pubDate: string; label: string; tier: FeedTier }[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items ?? []) {
        if (!item.link || !item.title) continue;
        const pubDate = item.isoDate || item.pubDate
          ? new Date(item.isoDate ?? item.pubDate ?? "").toISOString()
          : new Date().toISOString();

        if (Date.now() - new Date(pubDate).getTime() > MAX_ARTICLE_AGE_MS) continue;

        allItems.push({
          title: item.title.slice(0, 280),
          summary: (item.contentSnippet || item.content || item.summary || "").slice(0, 1000),
          url: item.link,
          pubDate,
          label: feed.label,
          tier: feed.tier,
        });
      }
      await new Promise((r) => setTimeout(r, 200));
    } catch (e: any) {
      console.warn(`[RSS] Feed "${feed.label}" failed:`, e.message);
    }
  }

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
    if (!isRelevantEvent(item.title, item.summary, item.tier)) {
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
      raw_data: { url: item.url, source: item.label, tier: item.tier },
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

      const { lat: resolvedLat, lng: resolvedLng } = resolveGeoCoords(
        rawEventPayload.title,
        rawEventPayload.country,
        classification.region
      );

      const { data: sigInsert, error: sigErr } = await supabase.from("signals").insert({
        raw_event_ids: [rawEventId],
        title: rawEventPayload.title,
        summary: classification.summary,
        severity: classification.severity,
        confidence: classification.confidence,
        event_type: rawEventPayload.event_type,
        country: formatCountryName(null),
        region: classification.region,
        lat: resolvedLat,
        lng: resolvedLng,
        sources_count: 1,
        commodity_impacts: classification.commodityImpacts,
        is_breaking: classification.isBreaking,
        is_active: true,
        event_date: rawEventPayload.event_date,
      }).select("id").maybeSingle();

      if (!sigErr) {
        signals++;
        // Dispatch + briefing generation inline — bypass the queue for both, same as
        // classification above, since nothing feeds either dormant BullMQ queue.
        if (sigInsert?.id) {
          if (classification.severity >= 7) {
            try {
              await generateSignalAnalysis(sigInsert.id as string);
              console.log(`[RSS] signal-generation completed for signal ${sigInsert.id}`);
            } catch (e) {
              console.error(`[RSS] signal-generation failed for signal ${sigInsert.id}:`, e instanceof Error ? e.message : e);
            }
          }
          try {
            const dispatchResult = await dispatchAlertsForSignal(sigInsert.id as string);
            console.log(`[RSS] alert-dispatch for signal ${sigInsert.id}:`, dispatchResult);
          } catch (e) {
            console.error(`[RSS] alert-dispatch failed for signal ${sigInsert.id}:`, e instanceof Error ? e.message : e);
          }
        }
      } else console.error("[RSS] Signal insert error:", sigErr.message);
    } catch (e: any) {
      console.error("[RSS] Classification/signal insert failed:", e.message);
    }
  }

  return { fetched, inserted, duplicates, filtered, signals };
}
