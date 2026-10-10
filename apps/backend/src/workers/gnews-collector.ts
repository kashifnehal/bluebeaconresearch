import axios from "axios";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { getEnv } from "../env.js";
import { isAnthropicBudgetAvailable } from "../lib/anthropic-budget.js";
import { isRelevantEvent } from "./gdelt-collector.js";
import { ClaudeService, shouldStopBatch } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";
import { generateSignalAnalysis } from "./signal-generator.js";
import { insertOrMergeSignal } from "./signal-merge.js";
import { tryTitlePreFilterSkip } from "./title-prefilter.js";
import { recordServiceHealth } from "../lib/service-health.js";
import { resolveGeoCoords } from "../lib/geo-resolver.js";
import { findSimilarRecentSignal } from "../lib/novelty-hint.js";
import { logMaterialityRejection } from "../lib/materiality-gate.js";
import { detectHeadlinePlacement } from "../lib/headline-placement.js";
import { articleExternalId, canonicalUrl } from "../lib/external-id.js";
import { isWithinIntakeWindow } from "../lib/article-age.js";

const claude = new ClaudeService();

// Free plan: non-commercial (gnews.io/pricing, GNews dashboard quota page). Remove
// or upgrade before the first paying customer (founder decision 2026-10-05: replace GNews with a paid news source before go-live).
// Free plan caps: 100 req/day, 10 articles/req, ~12h publish delay. The ingestion
// cycle runs every 30 min -> 24h / 0.5h = 48 cycles/day. One query per cycle (not
// one request per query per cycle) keeps total GNews traffic at 48 req/day
// regardless of GNEWS_QUERIES.length, comfortably under the 100 req/day cap,
// with each topic getting its turn via W7-GNEWS-ROTATE below instead of one query
// spending the whole daily budget on itself.
const GNEWS_QUERIES = [
  "conflict OR war OR sanctions OR trade OR stock market OR inflation OR fed OR earnings", // geopolitics and markets
  // Metals/energy terms from ALLOWED_COMMODITY_ASSETS + COMMODITY_ASSET_ALIASES in
  // claude.service.ts: USOIL/UKOIL ("oil", "crude", "brent"), NGAS ("natural gas"),
  // XAUUSD ("gold"), COPPER, XAGUSD ("silver"), TTF_GAS ("european gas").
  "oil OR crude OR brent OR \"natural gas\" OR OPEC OR pipeline OR refinery OR gold OR copper OR silver OR \"european gas\"",
  // Shipping/sanctions: no asset in ALLOWED_COMMODITY_ASSETS maps to "shipping" —
  // these are route/trade-disruption terms, not ticker-derived.
  "shipping OR tanker OR port OR canal OR sanctions OR embargo OR \"export ban\" OR tariff OR blockade",
];

// W7-GNEWS-ROTATE: picks one query per ingestion cycle (cycleIndex % GNEWS_QUERIES.length)
// so the topics rotate evenly across the day instead of all sharing one query.
// Pure/exported for testing; the actual rotation counter lives in runGnewsCollectorOnce.
export function selectGnewsQuery(cycleIndex: number): { query: string; index: number } {
  const index = ((cycleIndex % GNEWS_QUERIES.length) + GNEWS_QUERIES.length) % GNEWS_QUERIES.length;
  return { query: GNEWS_QUERIES[index], index };
}

export const GNEWS_QUERY_COUNT = GNEWS_QUERIES.length;

// Process-lifetime counter — resets on deploy/restart, which just means rotation
// restarts from query 0. Not persisted; 48 cycles/day comfortably covers all
// GNEWS_QUERIES.length topics multiple times even after a restart.
let gnewsCycleCounter = 0;

async function fetchGnewsArticles(query: string, token: string) {
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&sortby=publishedAt&token=${token}`;
  const res = await axios.get(url, { timeout: 20_000 });
  return (res.data?.articles ?? []) as any[];
}

export async function runGnewsCollectorOnce() {
  // W8-BUDGET-DEFER (ADR 035, founder decision D10) — when the daily ingestion
  // budget is closed, fetch nothing and write nothing. Checked before incrementing
  // gnewsCycleCounter so a skipped cycle doesn't burn a turn in the query rotation
  // (W7-GNEWS-ROTATE) for a query that was never actually fetched.
  if (!(await isAnthropicBudgetAvailable("ingestion"))) {
    console.log("[GNews] budget closed, skipping cycle");
    return {
      ok: true,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      filtered: 0,
      signals: 0,
      prefiltered: 0,
      materialityRejected: 0,
      staleSkipped: 0,
      budgetClosed: true,
    };
  }

  const env = getEnv();
  if (!env.GNEWS_API_KEY) return { ok: false, error: "GNEWS_API_KEY missing" };

  const supabase = getSupabaseAdmin();

  // W7-GNEWS-ROTATE: one query this cycle, picked in rotation (see selectGnewsQuery above).
  const cycleIndex = gnewsCycleCounter++;
  const { query, index: queryIndex } = selectGnewsQuery(cycleIndex);

  const allArticles: any[] = [];
  let fetchError: string | undefined;
  let rateLimited = false;
  const fetchStartedAt = Date.now();
  try {
    const articles = await fetchGnewsArticles(query, env.GNEWS_API_KEY);
    allArticles.push(...articles);
    console.log(`[GNews] query #${queryIndex} ("${query}") returned ${articles.length} article(s)`);
  } catch (e: any) {
    // Quota exhaustion (402/429) is expected on the free tier (#64) — still record
    // it so the health counter climbs; workers.ts just uses a wider alert threshold
    // for GNews so a normal quota gap doesn't page anyone.
    if (e.response?.status === 402 || e.response?.status === 429) {
      console.warn("[GNews] Rate limit hit");
      fetchError = `quota/rate limit (HTTP ${e.response.status})`;
      rateLimited = true;
    } else {
      console.warn(`[GNews] query #${queryIndex} ("${query}") failed:`, e.message);
      fetchError = e.message;
    }
  }

  const fetchLatencyMs = Date.now() - fetchStartedAt;

  // A run that fetched nothing and hit an error is a failed run for health tracking.
  if (allArticles.length === 0 && fetchError) {
    await recordServiceHealth(
      "gnews",
      rateLimited ? "rate_limited" : "error",
      fetchError,
      fetchLatencyMs,
    );
    return { ok: false, fetched: 0, inserted: 0, duplicates: 0, filtered: 0, signals: 0, error: fetchError };
  }

  await recordServiceHealth(
    "gnews",
    "ok",
    `fetched ${allArticles.length} article(s)`,
    fetchLatencyMs,
  );

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
  let prefiltered = 0;
  let materialityRejected = 0;
  let staleSkipped = 0;

  // W7-DEDUPE-KEY: one prefetch per cycle instead of one .select() per article.
  // GNews rows are stored with source "newsapi" (see rawEventPayload.source below).
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const existingRows = await supabase
    .from("raw_events")
    .select("external_id, raw_data")
    .eq("source", "newsapi")
    .gte("created_at", sevenDaysAgoIso);
  if (existingRows.error) {
    console.error("[GNews] prefetch of existing external_id/url failed:", existingRows.error.message);
  }
  const seenExternalIds = new Set<string>();
  const seenCanonicalUrls = new Set<string>();
  for (const row of existingRows.data ?? []) {
    if (row.external_id) seenExternalIds.add(row.external_id);
    const url = (row.raw_data as any)?.url;
    if (url) seenCanonicalUrls.add(canonicalUrl(url));
  }

  let passedFilters = 0;
  let alreadySeen = 0;

  for (const a of articles) {
    if (!a.url) continue;
    const externalId = articleExternalId("gnews", a.url);

    const title = a.title?.slice(0, 280) ?? "GNews article";
    const summary = a.description?.slice(0, 1000) ?? "";
    if (!isRelevantEvent(title, summary)) {
      filtered += 1;
      continue;
    }
    passedFilters += 1;

    if (seenExternalIds.has(externalId) || seenCanonicalUrls.has(canonicalUrl(a.url))) {
      duplicates += 1;
      alreadySeen += 1;
      continue;
    }

    const publishedAt = a.publishedAt ? new Date(a.publishedAt) : new Date();

    // W8-INTAKE-GUARDS — ADR 007: the feed shows a 24h event_date window, so an
    // article this old can never appear in it. Skip before the raw_events insert
    // — before the classifier — so no Claude call or stale event_date reaches
    // the pipeline.
    if (!isWithinIntakeWindow(publishedAt, new Date())) {
      staleSkipped += 1;
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
      event_date: publishedAt.toISOString(),  // article publish time
      raw_data: { ...a, freshness: "cached" },  // GNews free tier surfaces articles with up to ~12h lag (ADR 007)
    };

    const insert = await supabase.from("raw_events").insert(rawEventPayload).select("id").maybeSingle();

    if (insert.error) {
      // 23505 = unique_violation on (source, external_id) — a genuine race/duplicate.
      if (insert.error.code === "23505") {
        duplicates += 1;
        alreadySeen += 1;
      } else {
        console.error("[GNews] raw_events insert error:", insert.error.message);
      }
      continue;
    }
    if (!insert.data?.id) continue;
    inserted += 1;
    seenExternalIds.add(externalId);
    seenCanonicalUrls.add(canonicalUrl(a.url));

    const rawEventId = insert.data.id as string;

    // Pre-classification near-duplicate skip (#95 item 1a). Only fires on an exact
    // normalized-title match to a raw_event from the same source classified in the
    // last 45 min — the literal same-article-refetched case. Links into the existing
    // signal and skips the Haiku call entirely.
    const pre = await tryTitlePreFilterSkip({
      supabase,
      collectorLabel: "GNews",
      rawEventId,
      source: rawEventPayload.source,
      title: rawEventPayload.title,
    });
    if (pre.skipped) {
      prefiltered += 1;
      continue;
    }

    // Classify and write signal directly — reliable even when Redis/BullMQ is unavailable
    try {
      const similarRecentSignal = await findSimilarRecentSignal(supabase, {
        title: rawEventPayload.title,
      });
      if (similarRecentSignal) {
        console.log(
          `[NOVELTY-HINT] title="${rawEventPayload.title}" match="${similarRecentSignal.title}" similarity=${similarRecentSignal.similarity.toFixed(2)}`,
        );
      }
      // a.content is GNews's (truncated) full-article body — richer than a.description,
      // which is only ever a 1-2 sentence excerpt. Not currently written into
      // rawEventPayload.summary (kept as-is, out of this task's scope); used here only
      // to decide whether the triggering keyword content is headline- or body-only.
      const headlinePlacement = detectHeadlinePlacement(
        rawEventPayload.title,
        String(a.content ?? a.description ?? ""),
      );
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
            `[GNews] classifyEvent deferred (reason=${classification.deferReason}) — stopping batch for this cycle`,
          );
          break;
        }
        console.log(
          `[GNews] classifyEvent deferred (reason=${classification.deferReason}) — skipping this event, continuing batch`,
        );
        continue;
      }

      // #139/#141 materiality gate — the "this does not mean anything, drop it"
      // step the pipeline never had (claude/85_SIGNAL_INGESTION_FILTER_SEVERITY_AUDIT.md).
      // raw_events row above stays either way (dedup/audit); only the signals
      // insert is skipped.
      if (!classification.materialityPass) {
        materialityRejected += 1;
        await logMaterialityRejection({
          collectorLabel: "GNews",
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
        collectorLabel: "GNews",
        rawEventId,
        classification,
        title: rawEventPayload.title,
        eventType: rawEventPayload.event_type,
        eventDate: rawEventPayload.event_date,  // article publish time shown in UI
        // rawEventPayload.country is always null (GNews articles carry no
        // per-article country) — classification.country (Claude's read of
        // the article) is the only real per-event location available here.
        country: formatCountryName(classification.country),
        lat: resolvedLat,
        lng: resolvedLng,
        freshness: "cached",
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
            console.log(`[GNews] signal-generation completed for signal ${mergeResult.signalId}`);
          } catch (e) {
            console.error(`[GNews] signal-generation failed for signal ${mergeResult.signalId}:`, e instanceof Error ? e.message : e);
          }
        }
        try {
          const dispatchResult = await dispatchAlertsForSignal(mergeResult.signalId);
          console.log(`[GNews] alert-dispatch for signal ${mergeResult.signalId}:`, dispatchResult);
        } catch (e) {
          console.error(`[GNews] alert-dispatch failed for signal ${mergeResult.signalId}:`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e: any) {
      console.error("[GNews] Classification/signal insert failed:", e.message);
    }
  }

  // W7-DEDUPE-KEY diag: one line per cycle — fetched/passed-filters/already-seen/inserted.
  // staleSkipped (W8-INTAKE-GUARDS) added separately so the existing counters stay comparable.
  console.log(
    `[GNews-DIAG] fetched=${fetched} passedFilters=${passedFilters} alreadySeen=${alreadySeen} staleSkipped=${staleSkipped} inserted=${inserted}`,
  );

  return { ok: true, fetched, inserted, duplicates, filtered, signals, prefiltered, materialityRejected, staleSkipped };
}
