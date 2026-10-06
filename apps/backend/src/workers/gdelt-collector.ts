import axios from "axios";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { isAnthropicBudgetAvailable } from "../lib/anthropic-budget.js";
import { ClaudeService, shouldStopBatch } from "../services/claude.service.js";
import { formatCountryName } from "./ai-classifier.js";
import { isRelevantEvent } from "../lib/relevance-filter.js";
import { dispatchAlertsForSignal } from "./alert-dispatcher.js";
import { generateSignalAnalysis } from "./signal-generator.js";
import { insertOrMergeSignal } from "./signal-merge.js";
import { tryTitlePreFilterSkip } from "./title-prefilter.js";
import { recordServiceHealth } from "../lib/service-health.js";
import { resolveGeoCoords } from "../lib/geo-resolver.js";
import { hasSimilarRecentSignal } from "../lib/novelty-hint.js";
import { logMaterialityRejection } from "../lib/materiality-gate.js";
import { detectHeadlinePlacement } from "../lib/headline-placement.js";
import { articleExternalId, canonicalUrl } from "../lib/external-id.js";
import { isWithinIntakeWindow } from "../lib/article-age.js";

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
// maxrecords=250 (was 50) — GDELT's own documented maximum for the DOC API, per
// their project blog; free, keyless, zero additional cost. claude/237.
const GDELT_API_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=(conflict+OR+war+OR+sanctions+OR+military+OR+oil+OR+stock+market+OR+trade+OR+inflation+OR+fed+OR+earnings)+sourcelang:eng&mode=artlist&maxrecords=250&format=json&sort=DateDesc";

// GDELT's DOC API is keyless with no authenticated tier, and a 429 can reflect an
// IP-level block lasting up to ~15 min (shared Railway egress IP, not our own request
// rate — we only issue one request per 15-min cron cycle). That block never clears
// within a single run, so a retry-with-backoff just burns wall-clock and still fails.
// Allow one short retry (covers a genuine transient 429), then give up — the next cron
// tick 15 min later is past a typical block window and is the real recovery path.
const GDELT_MAX_RETRIES = 1;
const GDELT_BACKOFF_BASE_MS = 5_000;

async function fetchGdeltWithBackoff() {
  let lastErr: any;
  for (let attempt = 0; attempt <= GDELT_MAX_RETRIES; attempt++) {
    try {
      // 40s (was 25s): Railway logs 2026-08-28 showed `timeout of 25000ms exceeded`
      // + intermittent ECONNRESET every cycle for 5+ hours against api.gdeltproject.org.
      // Bumped to separate "borderline slow" from "actually down" — GDELT's keyless
      // DOC API has no SLA and their team has acknowledged infra outages before. This
      // is the only GDELT-specific change; visibility (pipeline-status health +
      // workers.ts Sentry alert) is the real fix if it stays down.
      return await axios.get(GDELT_API_URL, { timeout: 40_000 });
    } catch (e: any) {
      lastErr = e;
      if (e.response?.status !== 429 || attempt === GDELT_MAX_RETRIES) throw e;
      const delayMs = GDELT_BACKOFF_BASE_MS * 2 ** attempt + Math.random() * 10_000;
      console.warn(
        `[GDELT] Rate limited (429), retry ${attempt + 1}/${GDELT_MAX_RETRIES} in ${Math.round(delayMs / 1000)}s...`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export async function runGdeltCollectorOnce() {
  // W8-BUDGET-DEFER (ADR 035, founder decision D10) — when the daily ingestion
  // budget is closed, fetch nothing and write nothing: a closed budget means
  // classifyEvent() would just defer every raw_event anyway (see claude.service.ts),
  // and GDELT's DOC API only ever returns its newest maxrecords=250 — fetching and
  // discarding during a closed window would permanently lose whatever article(s)
  // the full cap would have pushed out by the time the budget reopens.
  if (!(await isAnthropicBudgetAvailable("ingestion"))) {
    console.log("[GDELT] budget closed, skipping cycle");
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

  const supabase = getSupabaseAdmin();

  let res: any;
  const fetchStartedAt = Date.now();
  try {
    res = await fetchGdeltWithBackoff();
    await recordServiceHealth("gdelt", "ok", undefined, Date.now() - fetchStartedAt);
  } catch (e: any) {
    console.error("[GDELT] Fetch failed after retries:", e.message);
    const status = e?.response?.status;
    await recordServiceHealth(
      "gdelt",
      status === 429 ? "rate_limited" : "error",
      e.message,
      Date.now() - fetchStartedAt,
    );
    return { ok: false, fetched: 0, inserted: 0, duplicates: 0, filtered: 0, signals: 0, error: e.message };
  }

  const articles: GdeltArticle[] = res.data?.articles ?? [];

  // W7-DEDUPE-KEY diag (2026-10-05): check whether GDELT's keyless DOC API returns
  // the same article list every cycle — PROBABLE, not proven: the
  // repeated fetched=250/duplicates=83/filtered=167 lines look like GDELT's keyless
  // DOC API returning the same article list every cycle. This hashes the sorted URL
  // set + newest seendate seen so a later log diff can confirm or disprove that
  // without guessing. Query itself is unchanged — diagnostic only.
  const sortedUrls = articles.map((a) => a.url ?? "").sort();
  const urlsHash = createHash("sha1").update(sortedUrls.join("\n")).digest("hex");
  const newestSeendate = articles.reduce(
    (max, a) => (a.seendate && a.seendate > max ? a.seendate : max),
    "",
  );
  console.log(
    `[GDELT] newest_seendate=${newestSeendate || "none"} urls_hash=${urlsHash} fetched=${articles.length}`,
  );

  let fetched = articles.length;
  let inserted = 0;
  let duplicates = 0;
  let filtered = 0;
  let signals = 0;
  let prefiltered = 0;
  let materialityRejected = 0;
  let staleSkipped = 0;

  // W7-DEDUPE-KEY: one prefetch per cycle instead of one .select() per article
  // (was ~250 selects/cycle for GDELT's maxrecords=250). Covers both the new
  // full-hash external_id and the canonical URL, so an article already stored
  // under the OLD truncated id is still recognized as seen.
  const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const existingRows = await supabase
    .from("raw_events")
    .select("external_id, raw_data")
    .eq("source", "gdelt")
    .gte("created_at", sevenDaysAgoIso);
  if (existingRows.error) {
    console.error("[GDELT] prefetch of existing external_id/url failed:", existingRows.error.message);
  }
  const seenExternalIds = new Set<string>();
  const seenCanonicalUrls = new Set<string>();
  for (const row of existingRows.data ?? []) {
    if (row.external_id) seenExternalIds.add(row.external_id);
    const url = (row.raw_data as any)?.url;
    if (url) seenCanonicalUrls.add(canonicalUrl(url));
  }

  let passedLanguageAndRelevance = 0;
  let alreadySeen = 0;

  for (const a of articles) {
    if (!a.url) continue;
    const externalId = articleExternalId("gdelt", a.url);

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
    passedLanguageAndRelevance += 1;

    if (seenExternalIds.has(externalId) || seenCanonicalUrls.has(canonicalUrl(a.url))) {
      duplicates += 1;
      alreadySeen += 1;
      continue;
    }

    const eventDate = a.seendate
      ? new Date(
          a.seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z")
        ).toISOString()
      : new Date().toISOString();

    // W8-INTAKE-GUARDS — ADR 007: the feed shows a 24h event_date window, so an
    // article this old can never appear in it. GDELT's keyless DOC API returns
    // the same backlog every cycle (see the W7-DEDUPE-KEY diag above), so without
    // this, stale articles keep reaching the classifier run after run. Skip before
    // the raw_events insert — before the classifier — so no Claude call or stale
    // event_date reaches the pipeline.
    if (!isWithinIntakeWindow(new Date(eventDate), new Date())) {
      staleSkipped += 1;
      continue;
    }

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

    if (insert.error) {
      // 23505 = unique_violation on (source, external_id) — a genuine race/duplicate,
      // not a real error. Anything else is a real insert failure worth the log line.
      if (insert.error.code === "23505") {
        duplicates += 1;
        alreadySeen += 1;
      } else {
        console.error("[GDELT] raw_events insert error:", insert.error.message);
      }
      continue;
    }
    if (!insert.data?.id) continue;
    inserted += 1;
    seenExternalIds.add(externalId);
    seenCanonicalUrls.add(canonicalUrl(a.url));

    const rawEventId = insert.data.id as string;

    // Pre-classification near-duplicate skip (#95 item 1a) — see title-prefilter.ts.
    const pre = await tryTitlePreFilterSkip({
      supabase,
      collectorLabel: "GDELT",
      rawEventId,
      source: "gdelt",
      title,
    });
    if (pre.skipped) {
      prefiltered += 1;
      continue;
    }

    try {
      const countryLabel = formatCountryName(country);
      const similarStoryLast48h = await hasSimilarRecentSignal(supabase, {
        country: countryLabel,
        eventType: "news",
      });
      // GDELT's article records (see GdeltArticle above) carry no body/summary text at
      // all — raw_events.summary is always null for this source (see the insert above).
      // detectHeadlinePlacement() with an empty body still resolves correctly: a keyword
      // match can only ever come from the title here, so it reads "headline", never
      // "body" — there's nothing to falsely suppress the bonus against.
      const headlinePlacement = detectHeadlinePlacement(title, "");
      const classification = await claude.classifyEvent(
        {
          id: rawEventId,
          title,
          country,
          event_type: "news",
          event_date: eventDate,
        },
        { similarStoryLast48h, headlinePlacement },
      );

      // W8-BUDGET-DEFER (ADR 035, founder decision 2026-10-05) plus founder
      // decision 2026-10-06 — deferred is not a real gate decision. Do not insert
      // a signal, do not call logMaterialityRejection, and do not stamp
      // materiality_checked_at (null keeps the row retryable; reconciliation.ts
      // retries on its next run, bounded by ORPHAN_MAX_AGE_HOURS = 36 and that
      // file's existing every-30-min cron: 36h / 0.5h = 72 ticks). shouldStopBatch
      // stops the rest of this cycle for budget_closed / spend_limit / service-level
      // api_error; json_parse and request-specific 400/404/413 skip only this event.
      if (classification.deferred) {
        if (shouldStopBatch(classification.deferReason, classification.deferHttpStatus)) {
          console.log(
            `[GDELT] classifyEvent deferred (reason=${classification.deferReason}) — stopping batch for this cycle`,
          );
          break;
        }
        console.log(
          `[GDELT] classifyEvent deferred (reason=${classification.deferReason}) — skipping this event, continuing batch`,
        );
        continue;
      }

      // #139/#141 materiality gate — see gnews-collector.ts for the full comment.
      if (!classification.materialityPass) {
        materialityRejected += 1;
        await logMaterialityRejection({
          collectorLabel: "GDELT",
          title,
          source: "gdelt",
          classification,
          supabase,
          rawEventId,
        });
        continue;
      }

      const { lat: resolvedLat, lng: resolvedLng } = resolveGeoCoords(
        title,
        classification.country,
        country,
        classification.region
      );

      const mergeResult = await insertOrMergeSignal({
        supabase,
        collectorLabel: "GDELT",
        rawEventId,
        classification,
        title,
        eventType: "news",
        eventDate,
        // #188 — `country` here (a.sourcecountry) is the PUBLISHING OUTLET's
        // country, not the event's location (a US outlet covering a Middle
        // East story has sourcecountry "US"). classification.country is
        // Claude's own read of the article and is what should actually be
        // displayed; sourcecountry stays as the raw_events.country value
        // (kept above) and only remains a fallback here for when Claude
        // genuinely couldn't tell.
        country: formatCountryName(classification.country ?? country),
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

  // W7-DEDUPE-KEY diag: one line per cycle — fetched/passed-filters/already-seen/inserted.
  // staleSkipped (W8-INTAKE-GUARDS) added separately so the existing counters stay comparable.
  console.log(
    `[GDELT-DIAG] fetched=${fetched} passedFilters=${passedLanguageAndRelevance} alreadySeen=${alreadySeen} staleSkipped=${staleSkipped} inserted=${inserted}`,
  );

  return { ok: true, fetched, inserted, duplicates, filtered, signals, prefiltered, materialityRejected, staleSkipped };
}
