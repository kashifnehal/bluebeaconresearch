import Parser from "rss-parser";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { resolveGeoCoords } from "../lib/geo-resolver.js";
import { ClaudeService } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { isRelevantEvent, type FeedTier } from "../lib/relevance-filter.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";
import { generateSignalAnalysis } from "./signal-generator.js";
import { insertOrMergeSignal } from "./signal-merge.js";

const claude = new ClaudeService();

// Present as a normal browser and accept the usual feed content-types. rss-parser's
// default `User-Agent: rss-parser` is increasingly 403'd / bot-challenged by major
// publishers (BBC, Guardian, Al Jazeera, NYT, NPR, …). Investigation 2026-08-28
// (#63): from ~Aug 12, every feed except DW World stopped yielding rows in
// production while all feed URLs stayed reachable and valid from an ordinary IP —
// the per-feed failures were swallowed as a warn-level log and never surfaced.
// This is the low-risk first mitigation; if the block turns out to be purely on
// the Railway egress IP it won't be enough on its own (see the collector report).
const parser = new Parser({
  timeout: 20_000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    Accept:
      "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
  },
});

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
  // UN News (https://news.un.org/feed/subscribe/en/news/all/rss.xml) removed
  // 2026-08-28 (#63): it always responds with gzip-encoded bytes even when the
  // client doesn't negotiate compression, which rss-parser's HTTP client doesn't
  // decode — so parseURL() throws "Non-whitespace before first tag" on every run,
  // from every IP. It contributed 1 row in its entire lifetime. Re-add only with
  // a manual fetch + decompress path if UN coverage is wanted back.
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

  let feedsOk = 0;
  let feedsFailed = 0;
  const failedFeeds: string[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      feedsOk++;
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
      feedsFailed++;
      failedFeeds.push(feed.label);
      // error, not warn: a feed failing every cycle is a real degradation that
      // stayed invisible for weeks (#63). feedsFailed is also returned below so
      // pipeline:last_run / the ingestion-status endpoint reflect it.
      console.error(`[RSS] Feed "${feed.label}" failed (${feed.url}):`, e.message);
    }
  }

  if (feedsFailed > 0) {
    console.error(
      `[RSS] ${feedsFailed}/${RSS_FEEDS.length} feeds failed this cycle: ${failedFeeds.join(", ")}`,
    );
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
      raw_data: { url: item.url, source: item.label, tier: item.tier, freshness: "realtime" },
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

      const mergeResult = await insertOrMergeSignal({
        supabase,
        collectorLabel: "RSS",
        rawEventId,
        classification,
        title: rawEventPayload.title,
        eventType: rawEventPayload.event_type,
        eventDate: rawEventPayload.event_date,
        country: formatCountryName(null),
        lat: resolvedLat,
        lng: resolvedLng,
        freshness: "realtime",
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
        signals++;
        if (classification.severity >= 7) {
          try {
            await generateSignalAnalysis(mergeResult.signalId);
            console.log(`[RSS] signal-generation completed for signal ${mergeResult.signalId}`);
          } catch (e) {
            console.error(`[RSS] signal-generation failed for signal ${mergeResult.signalId}:`, e instanceof Error ? e.message : e);
          }
        }
        try {
          const dispatchResult = await dispatchAlertsForSignal(mergeResult.signalId);
          console.log(`[RSS] alert-dispatch for signal ${mergeResult.signalId}:`, dispatchResult);
        } catch (e) {
          console.error(`[RSS] alert-dispatch failed for signal ${mergeResult.signalId}:`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e: any) {
      console.error("[RSS] Classification/signal insert failed:", e.message);
    }
  }

  // A run is "ok" only if at most half the configured feeds threw. 2 consecutive
  // not-ok runs is what workers.ts alerts on — the check that would have caught the
  // original #63 incident (13/14 feeds dead) on day one instead of 16 days later.
  const feedsAttempted = feedsOk + feedsFailed;
  const ok = feedsAttempted > 0 && feedsFailed / feedsAttempted <= 0.5;
  const error =
    feedsFailed > 0 ? `${feedsFailed}/${feedsAttempted} feeds failed: ${failedFeeds.join(", ")}` : undefined;

  return { ok, error, fetched, inserted, duplicates, filtered, signals, feedsOk, feedsFailed };
}
