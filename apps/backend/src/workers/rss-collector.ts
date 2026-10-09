import Parser from "rss-parser";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { isAnthropicBudgetAvailable } from "../lib/anthropic-budget.js";
import { resolveGeoCoords } from "../lib/geo-resolver.js";
import { ClaudeService, shouldStopBatch } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import {
  isRelevantEvent,
  shouldExclude,
  isRoutineMarketNoise,
  findExcludeMatch,
  hasAnchor,
  EXACT_WORD_KEYWORDS,
  type FeedTier,
} from "../lib/relevance-filter.js";
import { matchShadowGroups } from "../lib/shadow-terms.js";
import { recordDrops, type DropRecord } from "./drop-sample-store.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";
import { generateSignalAnalysis } from "./signal-generator.js";
import { insertOrMergeSignal } from "./signal-merge.js";
import { tryTitlePreFilterSkip } from "./title-prefilter.js";
import { buildDropSample, type Drop, type DropReason } from "./rss-drop-sample.js";
import { recordServiceHealth } from "../lib/service-health.js";
import { findSimilarRecentSignal } from "../lib/novelty-hint.js";
import { logMaterialityRejection } from "../lib/materiality-gate.js";
import { detectHeadlinePlacement } from "../lib/headline-placement.js";
import { articleExternalId, canonicalUrl } from "../lib/external-id.js";

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

/** Article age window per feed tier — 4h for broadcasters/aggregators (world) and
 * finance-tier feeds, per product requirement for market-moving news. "official"
 * feeds (central banks, EIA, USTR — tagged in RSS_FEEDS below) get a 24h window:
 * low cadence, but a press release is still material a day later. */
const AGE_WINDOW_MS: Record<FeedTier, number> = {
  world: 4 * 60 * 60 * 1000,
  finance: 4 * 60 * 60 * 1000,
  official: 24 * 60 * 60 * 1000,
};

// W8-INTAKE-GUARDS — clock-skew allowance, no source.
const CLOCK_SKEW_ALLOWANCE_MS = 5 * 60 * 1000;

type RssFeed = { url: string; label: string; tier: FeedTier };

/** Coverage line (#126) reads `CONFIGURED_RSS_FEED_COUNT` from packages/shared —
 *  keep that constant equal to this array's length when adding/removing feeds. */
const RSS_FEEDS: RssFeed[] = [
  // ── World / geopolitical ──
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", label: "BBC World", tier: "world" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", label: "Al Jazeera", tier: "world" },
  { url: "https://feeds.npr.org/1004/rss.xml", label: "NPR World", tier: "world" },
  { url: "https://www.france24.com/en/rss", label: "France24", tier: "world" },
  { url: "https://rss.dw.com/rdf/rss-en-world", label: "DW World", tier: "world" },
  { url: "https://www.theguardian.com/world/rss", label: "Guardian World", tier: "world" },
  // ── Official / agency (government, central bank — 24h age window, no keyword gate) ──
  { url: "https://www.eia.gov/rss/press_rss.xml", label: "EIA Press Releases", tier: "official" },
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", label: "Federal Reserve", tier: "official" },
  { url: "https://www.ecb.europa.eu/rss/press.xml", label: "ECB", tier: "official" },
  { url: "https://www.bankofengland.co.uk/rss/news", label: "Bank of England", tier: "official" },
  { url: "https://ustr.gov/rss.xml", label: "USTR", tier: "official" },
  { url: "https://rbi.org.in/pressreleases_rss.xml", label: "Reserve Bank of India", tier: "official" },
  { url: "https://www.boj.or.jp/en/rss/whatsnew.xml", label: "Bank of Japan", tier: "official" },
  { url: "https://www.eia.gov/rss/todayinenergy.xml", label: "EIA Today in Energy", tier: "official" },
  // IMF News (https://www.imf.org/en/news/rss) — evaluated 2026-09-28 (#238):
  // Akamai (server: AkamaiGHost) returns a hard 403 "Access Denied" on every
  // request, same bot-fingerprinting pattern as the USDA feed above. NOT added.
  // S&P Global Commodity Insights — evaluated 2026-09-28 (#238): every
  // candidate path under spglobal.com/commodityinsights and
  // spglobal.com/commodity-insights (rss-feed, rss-feed/oil,
  // news-research/latest-news/rss, and the bare news-research/latest-news
  // page itself) returns 403 (Akamai on some paths, a different WAF on
  // others). No working feed found. NOT added.
  // EIA "This Week in Petroleum"
  // (https://www.eia.gov/petroleum/weekly/includes/week_in_petroleum_rss.xml)
  // — evaluated 2026-09-28 (#238): resolves and returns real RSS 2.0, but the
  // feed is stale (latest item dated 10/29/2025, ~11 months old as of this
  // check) and every <pubDate> is malformed (literal "###################"
  // instead of a date). NOT added — fails the "current dated items" bar.
  // UN News (https://news.un.org/feed/subscribe/en/news/all/rss.xml) — re-evaluated
  // 2026-09-26 (claude/rss-feed-additions), still not added: server unconditionally
  // gzips the response (content-encoding: gzip, confirmed via raw magic bytes 1f8b)
  // even when the client doesn't negotiate compression, and rss-parser's HTTP client
  // doesn't decode it — parseURL() throws "Non-whitespace before first tag" on every
  // run, from every IP. Same failure as the original 2026-08-28 removal (#63). Re-add
  // only with a manual fetch + decompress path if UN coverage is wanted back.
  // USDA Latest News (https://www.usda.gov/rss/latest-releases.xml) — evaluated
  // 2026-09-26, re-confirmed 2026-09-28 (claude/rss-feed-additions-2): Akamai
  // (server: AkamaiGHost) returns a hard 403 "Access Denied" on every request
  // regardless of User-Agent/Accept headers — this is bot-fingerprinting (likely
  // TLS/IP-based), not a header issue. NOT added despite being on the requested
  // add-list for this ticket; see commit message / task report for detail.
  // ── Finance / markets (lighter filter — only hard-exclude sports/celebrity) ──
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", label: "BBC Business", tier: "finance" },
  { url: "https://www.theguardian.com/business/rss", label: "Guardian Business", tier: "finance" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", label: "NYT Business", tier: "finance" },
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", label: "MarketWatch", tier: "finance" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", label: "WSJ Markets", tier: "finance" },
  { url: "https://www.investing.com/rss/news.rss", label: "Investing.com", tier: "finance" },
  { url: "https://oilprice.com/rss/main", label: "OilPrice", tier: "finance" },
  { url: "https://www.rigzone.com/news/rss/rigzone_latest.aspx", label: "Rigzone", tier: "finance" },
  { url: "https://www.mining.com/feed/", label: "Mining.com", tier: "finance" },
  { url: "https://gcaptain.com/feed/", label: "gCaptain", tier: "finance" },
  { url: "https://splash247.com/feed/", label: "Splash247", tier: "finance" },
  { url: "https://www.hellenicshippingnews.com/feed/", label: "Hellenic Shipping News", tier: "finance" },
  { url: "https://www.freightwaves.com/feed", label: "FreightWaves", tier: "finance" },
  { url: "https://www.joc.com/rss.xml", label: "Journal of Commerce", tier: "finance" },
];

export const RSS_FEED_COUNT = RSS_FEEDS.length;

/** Diagnostic only (claude/w16a) — true when `text` contains an EXACT_WORD_KEYWORDS
 * term only as a substring of a longer word (e.g. "war" inside "Warsaw"), not as its
 * own word. isRelevantEvent()'s real word-boundary check already correctly excludes
 * this case; this just names that a nokeyword drop was a "near miss" rather than a
 * clean no-match. Never changes a keep/drop decision. */
function isMidwordOnlyMatch(text: string): boolean {
  const lower = text.toLowerCase();
  let hasWordBoundaryMatch = false;
  let hasSubstringMatch = false;
  for (const kw of EXACT_WORD_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(lower)) hasWordBoundaryMatch = true;
    if (lower.includes(kw)) hasSubstringMatch = true;
  }
  return !hasWordBoundaryMatch && hasSubstringMatch;
}

// TEMPORARY (claude/237) — remove after ~24-48h once the finance-tier yield data
// is captured. Goal: find out, with real per-feed numbers, why the 6 finance-tier
// feeds (NYT/BBC/Guardian Business, MarketWatch, WSJ Markets, Investing.com) yield
// almost no new raw_events despite fetching 10-51 items successfully every cycle,
// when claude/237 found only 1-3 finance-tier items/day landing across all 6 combined.
type FeedDiag = {
  fetched: number;
  tooOld: number;
  old4to12: number;
  old12to24: number;
  oldOver24: number;
  filteredIrrelevant: number;
  duplicate: number;
  new: number;
  // Of the too-old items, how many are not in the 7-day raw_events id prefetch
  // below — i.e. genuinely new articles this feed's window was too narrow to
  // catch, as opposed to an old entry we've already stored from a prior cycle.
  neverSeenOld: number;
};

export async function runRssCollectorOnce() {
  // W8-BUDGET-DEFER (ADR 035, founder decision D10) — when the daily ingestion
  // budget is closed, fetch nothing and write nothing. RSS's AGE_WINDOW_MS
  // (4h for world/finance tiers) means skipping a fetch here is the most lossy
  // of the 3 collectors if the budget stays closed for multiple cycles — see
  // ADR 035's explicit trade-off note.
  if (!(await isAnthropicBudgetAvailable("ingestion"))) {
    console.log("[RSS] budget closed, skipping cycle");
    return {
      ok: true,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      filtered: 0,
      signals: 0,
      prefiltered: 0,
      materialityRejected: 0,
      feedsOk: 0,
      feedsFailed: 0,
      budgetClosed: true,
    };
  }

  const supabase = getSupabaseAdmin();

  const allItems: { title: string; summary: string; url: string; pubDate: string; label: string; tier: FeedTier }[] = [];

  let feedsOk = 0;
  let feedsFailed = 0;
  const failedFeeds: string[] = [];

  const feedDiag: Record<string, FeedDiag> = {};
  for (const feed of RSS_FEEDS) {
    feedDiag[feed.label] = {
      fetched: 0,
      tooOld: 0,
      old4to12: 0,
      old12to24: 0,
      oldOver24: 0,
      filteredIrrelevant: 0,
      duplicate: 0,
      new: 0,
      neverSeenOld: 0,
    };
  }

  // Too-old items, held until the 7-day id prefetch below exists so neverSeenOld
  // can be computed against it.
  const tooOldItems: { label: string; externalId: string; canonUrl: string }[] = [];

  for (const feed of RSS_FEEDS) {
    const feedStartedAt = Date.now();
    let futureClampLogged = false;
    try {
      const parsed = await parser.parseURL(feed.url);
      feedsOk++;
      // #42 — one health row per feed per run, labelled rss:<feed-name>.
      await recordServiceHealth(
        `rss:${feed.label}`,
        "ok",
        `${parsed.items?.length ?? 0} item(s)`,
        Date.now() - feedStartedAt,
      );
      for (const item of parsed.items ?? []) {
        if (!item.link || !item.title) continue;
        feedDiag[feed.label].fetched++;
        let pubDate = item.isoDate || item.pubDate
          ? new Date(item.isoDate ?? item.pubDate ?? "").toISOString()
          : new Date().toISOString();

        // A feed item dated more than 5 min in the future (bad feed clock, not a
        // real future event) gets clamped to now instead of silently sitting
        // outside the 4h window below with a wrong event_date. Logged once per
        // feed per cycle, not once per item, to avoid flooding the log when a
        // whole feed is skewed.
        if (new Date(pubDate).getTime() - Date.now() > CLOCK_SKEW_ALLOWANCE_MS) {
          if (!futureClampLogged) {
            console.warn(`[RSS] Feed "${feed.label}" has a future-dated item, clamping to now`);
            futureClampLogged = true;
          }
          pubDate = new Date().toISOString();
        }

        const ageMs = Date.now() - new Date(pubDate).getTime();
        if (ageMs > AGE_WINDOW_MS[feed.tier]) {
          feedDiag[feed.label].tooOld++;
          const ageHours = ageMs / (60 * 60 * 1000);
          if (ageHours <= 12) feedDiag[feed.label].old4to12++;
          else if (ageHours <= 24) feedDiag[feed.label].old12to24++;
          else feedDiag[feed.label].oldOver24++;
          tooOldItems.push({
            label: feed.label,
            externalId: articleExternalId("rss", item.link),
            canonUrl: canonicalUrl(item.link),
          });
          continue;
        }

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
      await recordServiceHealth(
        `rss:${feed.label}`,
        "error",
        e.message,
        Date.now() - feedStartedAt,
      );
    }
  }

  if (feedsFailed > 0) {
    console.error(
      `[RSS] ${feedsFailed}/${RSS_FEED_COUNT} feeds failed this cycle: ${failedFeeds.join(", ")}`,
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
  let prefiltered = 0;
  let materialityRejected = 0;

  // W7-DEDUPE-KEY: one prefetch per cycle instead of one .select() per article.
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const existingRows = await supabase
    .from("raw_events")
    .select("external_id, raw_data")
    .eq("source", "rss")
    .gte("created_at", sevenDaysAgoIso);
  if (existingRows.error) {
    console.error("[RSS] prefetch of existing external_id/url failed:", existingRows.error.message);
  }
  const seenExternalIds = new Set<string>();
  const seenCanonicalUrls = new Set<string>();
  for (const row of existingRows.data ?? []) {
    if (row.external_id) seenExternalIds.add(row.external_id);
    const url = (row.raw_data as any)?.url;
    if (url) seenCanonicalUrls.add(canonicalUrl(url));
  }

  for (const old of tooOldItems) {
    if (!seenExternalIds.has(old.externalId) && !seenCanonicalUrls.has(old.canonUrl)) {
      feedDiag[old.label].neverSeenOld++;
    }
  }

  let passedFilters = 0;
  let alreadySeen = 0;
  const drops: Drop[] = [];
  // Full per-drop detail for drop-sample-store.ts (step 7) — the [RSS-DROP] sample log
  // below only ever prints up to 6 titles/feed; this carries every drop of the cycle.
  const dropRecords: DropRecord[] = [];
  // feed+title -> "shadow=<ids or ->" suffix, computed only for nokeyword drops, used
  // when printing the [RSS-DROP] line below. Never affects the keep/drop decision.
  const shadowSuffixByFeedTitle = new Map<string, string>();
  // [FIN-SHADOW] diag (step 5) — per finance-tier feed label, kept-item count and the
  // titles that had no anchor at all (hasAnchor() false AND no shadow-group match).
  const finShadowDiag = new Map<string, { kept: number; noAnchorTitles: string[] }>();

  for (const item of items) {
    if (!isRelevantEvent(item.title, item.summary, item.tier)) {
      filtered++;
      feedDiag[item.label].filteredIrrelevant++;
      let reason: DropReason;
      let detail: string | undefined;
      let shadowGroups: string[] | undefined;
      let midwordOnly = false;
      if (shouldExclude(item.title, item.summary)) {
        reason = "exclude-phrase";
        const match = findExcludeMatch(item.title, item.summary);
        if (match) detail = `${match.phrase}@${match.location}`;
      } else if (isRoutineMarketNoise(item.title)) {
        reason = "noise";
      } else {
        reason = "nokeyword";
        const combined = `${item.title} ${item.summary}`;
        shadowGroups = matchShadowGroups(combined);
        midwordOnly = isMidwordOnlyMatch(combined);
        // Keyed on the same title truncation buildDropSample() applies by default
        // (maxTitleChars=110) so the lookup below matches the printed sample title.
        shadowSuffixByFeedTitle.set(
          `${item.label}\u0000${item.title.slice(0, 110)}`,
          shadowGroups.length ? shadowGroups.join(",") : "-",
        );
      }
      drops.push({ feed: item.label, tier: item.tier, title: item.title, reason, detail });
      dropRecords.push({
        feed: item.label,
        tier: item.tier,
        reason: detail ? `exclude:${detail}` : reason,
        title: item.title,
        summary: item.summary,
        url: item.url,
        shadowGroups,
        midwordOnly,
      });
      continue;
    }
    passedFilters++;

    // [FIN-SHADOW] diag (step 5, log-only) — for finance-tier feeds (which skip the
    // keyword gate entirely in isRelevantEvent), track whether each kept item has
    // any anchor at all so the no-anchor rate/sample is visible per feed per cycle.
    if (item.tier === "finance") {
      const combined = `${item.title} ${item.summary}`;
      const diag = finShadowDiag.get(item.label) ?? { kept: 0, noAnchorTitles: [] as string[] };
      diag.kept++;
      if (!hasAnchor(combined) && matchShadowGroups(combined).length === 0) {
        diag.noAnchorTitles.push(item.title);
      }
      finShadowDiag.set(item.label, diag);
    }

    const externalId = articleExternalId("rss", item.url);

    if (seenExternalIds.has(externalId) || seenCanonicalUrls.has(canonicalUrl(item.url))) {
      duplicates++;
      alreadySeen++;
      feedDiag[item.label].duplicate++;
      continue;
    }

    const rawEventPayload = {
      // claude/237 — was "newsapi" (GNews's ingest path); mislabeled RSS rows as
      // GNews. 'rss' is its own raw_events.source value as of migration
      // 20260926053910_raw_events_source_add_rss.
      source: "rss" as const,
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

    if (insert.error) {
      // 23505 = unique_violation on (source, external_id) — a genuine race/duplicate.
      // Live evidence (2026-10-03): the old per-article select here looked like
      // "not found" on failure, so this error surfaced as ~40 insert-error log
      // lines/cycle while the diag below said new=0 — misleading noise, not a bug.
      if (insert.error.code === "23505") {
        duplicates++;
        alreadySeen++;
        feedDiag[item.label].duplicate++;
      } else {
        console.error("[RSS] raw_events insert error:", insert.error.message);
      }
      continue;
    }
    if (!insert.data?.id) continue;
    inserted++;
    feedDiag[item.label].new++;
    seenExternalIds.add(externalId);
    seenCanonicalUrls.add(canonicalUrl(item.url));

    const rawEventId = insert.data.id as string;

    // Pre-classification near-duplicate skip (#95 item 1a) — see title-prefilter.ts.
    // GNews ('newsapi') and RSS ('rss') are grouped as adjacent sources there, so
    // this also catches an article cross-posted between the two feeds within the
    // window.
    const pre = await tryTitlePreFilterSkip({
      supabase,
      collectorLabel: "RSS",
      rawEventId,
      source: rawEventPayload.source,
      title: rawEventPayload.title,
    });
    if (pre.skipped) {
      prefiltered++;
      continue;
    }

    try {
      const similarRecentSignal = await findSimilarRecentSignal(supabase, {
        title: rawEventPayload.title,
      });
      if (similarRecentSignal) {
        console.log(
          `[NOVELTY-HINT] title="${rawEventPayload.title}" match="${similarRecentSignal.title}" similarity=${similarRecentSignal.similarity.toFixed(2)}`,
        );
      }
      // item.summary is already the richest body text this collector has (rss-parser's
      // contentSnippet/content/summary chain — see the allItems.push() above), so it
      // doubles as the "full article text" the placement check compares against.
      const headlinePlacement = detectHeadlinePlacement(rawEventPayload.title, item.summary);
      const classification = await claude.classifyEvent(
        {
          id: rawEventId,
          title: rawEventPayload.title,
          summary: rawEventPayload.summary ?? "",
          country: rawEventPayload.country,
          event_type: rawEventPayload.event_type,
          event_date: rawEventPayload.event_date,
        },
        { similarRecentSignal, headlinePlacement },
      );

      // W8-BUDGET-DEFER (ADR 035, founder decision 2026-10-05) plus founder
      // decision 2026-10-06 — see gdelt-collector.ts for the full comment.
      // shouldStopBatch decides stop-the-batch vs skip-this-event.
      if (classification.deferred) {
        if (shouldStopBatch(classification.deferReason, classification.deferHttpStatus)) {
          console.log(
            `[RSS] classifyEvent deferred (reason=${classification.deferReason}) — stopping batch for this cycle`,
          );
          break;
        }
        console.log(
          `[RSS] classifyEvent deferred (reason=${classification.deferReason}) — skipping this event, continuing batch`,
        );
        continue;
      }

      // #139/#141 materiality gate — see gnews-collector.ts for the full comment.
      if (!classification.materialityPass) {
        materialityRejected += 1;
        await logMaterialityRejection({
          collectorLabel: "RSS",
          title: rawEventPayload.title,
          source: rawEventPayload.source,
          classification,
          supabase,
          rawEventId,
        });
        continue;
      }

      const { lat: resolvedLat, lng: resolvedLng } = resolveGeoCoords(
        rawEventPayload.title,
        classification.country,
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
        // rawEventPayload.country is always null (RSS feeds carry no
        // per-article country) — classification.country (Claude's read of
        // the article) is the only real per-event location available here.
        country: formatCountryName(classification.country),
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

  // TEMPORARY (claude/237) — one line per feed, see FeedDiag comment above. Remove
  // this block (and the feedDiag tracking above) after ~24-48h once captured.
  for (const feed of RSS_FEEDS) {
    const d = feedDiag[feed.label];
    console.log(
      `[RSS-DIAG] feed="${feed.label}" tier=${feed.tier} fetched=${d.fetched} tooOld=${d.tooOld} ` +
        `filteredIrrelevant=${d.filteredIrrelevant} duplicate=${d.duplicate} new=${d.new} ` +
        `old4to12=${d.old4to12} old12to24=${d.old12to24} oldOver24=${d.oldOver24} neverSeenOld=${d.neverSeenOld}`,
    );
  }

  // claude/rss-drop-sample — one line per feed with at least one relevance-filter
  // drop, showing the actual titles lost and why (exclude/noise/nokeyword).
  // claude/w16a — each sampled item also carries a "shadow" field: the shadow-term
  // group ids it matched, or "-" for exclude/noise drops (shadow is only computed
  // for nokeyword drops) or when no group matched. Log-only, no decision change.
  for (const ds of buildDropSample(drops)) {
    const sampleWithShadow = ds.sample.map((s) => ({
      ...s,
      shadow: shadowSuffixByFeedTitle.get(`${ds.feed}\u0000${s.t}`) ?? "-",
    }));
    console.log(
      `[RSS-DROP] feed="${ds.feed}" tier=${ds.tier} n=${ds.n} sample=${JSON.stringify(sampleWithShadow)}`,
    );
  }

  // claude/w16a step 7 — persist every drop of the cycle (not just the sampled 6/feed
  // above) behind DROP_SAMPLE_STORE; no-ops and never throws when the flag is off or
  // the table isn't there yet.
  await recordDrops(supabase, dropRecords);

  // [FIN-SHADOW] (step 5, log-only) — one line per finance-tier feed with at least
  // one kept item this cycle, showing how many kept items had no anchor at all.
  for (const [label, diag] of finShadowDiag) {
    console.log(
      `[FIN-SHADOW] feed="${label}" n=${diag.kept} noanchor=${diag.noAnchorTitles.length} ` +
        `sample=${JSON.stringify(diag.noAnchorTitles.slice(0, 6))}`,
    );
  }

  // W7-DEDUPE-KEY diag: one summary line per cycle across all feeds.
  console.log(
    `[RSS-DIAG] cycle summary: fetched=${fetched} passedFilters=${passedFilters} alreadySeen=${alreadySeen} inserted=${inserted}`,
  );

  // A run is "ok" only if at most half the configured feeds threw. 2 consecutive
  // not-ok runs is what workers.ts alerts on — the check that would have caught the
  // original #63 incident (13/14 feeds dead) on day one instead of 16 days later.
  const feedsAttempted = feedsOk + feedsFailed;
  const ok = feedsAttempted > 0 && feedsFailed / feedsAttempted <= 0.5;
  const error =
    feedsFailed > 0 ? `${feedsFailed}/${feedsAttempted} feeds failed: ${failedFeeds.join(", ")}` : undefined;

  return { ok, error, fetched, inserted, duplicates, filtered, signals, prefiltered, materialityRejected, feedsOk, feedsFailed };
}
