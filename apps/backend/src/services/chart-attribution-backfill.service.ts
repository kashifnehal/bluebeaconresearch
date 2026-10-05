import axios from "axios";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { ClaudeService } from "./claude.service.js";
import { COMMODITIES } from "../routes/commodities.js";
import { isRelevantEvent } from "../lib/relevance-filter.js";
import { formatCountryName } from "../workers/ai-classifier.js";
import { insertOrMergeSignal } from "../workers/signal-merge.js";
import { tryTitlePreFilterSkip } from "../workers/title-prefilter.js";
import { generateSignalAnalysis } from "../workers/signal-generator.js";
import { logMaterialityRejection } from "../lib/materiality-gate.js";
import { resolveGeoCoords } from "../lib/geo-resolver.js";
import { hasSimilarRecentSignal } from "../lib/novelty-hint.js";
import { recordServiceHealth } from "../lib/service-health.js";
import { articleExternalId } from "../lib/external-id.js";

// Phase 2 of chart attribution (#207/#228, Phase 1 = cb12e82/dc7dc45). Runs ONLY
// when apps/web's DB-first lookup (app/api/signals/attribution/route.ts) finds
// zero results for a clicked chart point — this never runs on the common path.
//
// Reuses the same raw_events -> materiality gate -> signals write path every
// live collector uses (see gdelt-collector.ts), just scoped to one asset's own
// 7-day lookback window instead of the cron job's rolling "latest" query, and
// synchronous (a user is waiting on this request) instead of a 15-min cron tick
// — see the single-attempt fetch and small candidate cap below, both deliberate
// departures from the collector's retry/250-record pattern for that reason.
//
// GDELT's DOC 2.0 API only searches its own rolling ~3-month archive (confirmed
// from GDELT's published API docs) — BBR's signals table currently spans
// 2026-08-09 to 2026-09-25, comfortably inside that window today. A window that
// falls outside GDELT's archive will just yield zero candidates here, same as
// any other "nothing found" case; not solved by this change.
const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_TIMEOUT_MS = 15_000;
const CANDIDATE_FETCH_LIMIT = 50;
const CLASSIFY_LIMIT = 5;
const WINDOW_DAYS = 7;

type GdeltArticle = {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
};

export type BackfillResult = {
  id: string;
  title: string;
  eventDate: string;
  hoursBefore: number;
  severity: number;
  backfilled: true;
};

const claude = new ClaudeService();

function assetDisplayName(asset: string): string {
  return COMMODITIES.find((c) => c.symbol === asset)?.label ?? asset;
}

function formatGdeltDateTime(ms: number): string {
  return new Date(ms).toISOString().replace(/[^0-9]/g, "").slice(0, 14);
}

function buildGdeltUrl(asset: string, startMs: number, endMs: number): string {
  const label = assetDisplayName(asset);
  const terms = Array.from(new Set([label, asset])).filter(Boolean);
  const query = `(${terms.map((t) => `"${t}"`).join(" OR ")}) sourcelang:eng`;
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    maxrecords: String(CANDIDATE_FETCH_LIMIT),
    format: "json",
    sort: "DateDesc",
    startdatetime: formatGdeltDateTime(startMs),
    enddatetime: formatGdeltDateTime(endMs),
  });
  return `${GDELT_DOC_URL}?${params.toString()}`;
}

function parseSeenDate(seendate: string | undefined): string {
  if (!seendate) return new Date().toISOString();
  return new Date(
    seendate.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z"),
  ).toISOString();
}

/**
 * Given a raw commodity/currency-pair classification array, does it name the
 * requested asset? Used as the "discard anything not genuinely relevant to
 * this asset" filter from the task spec — GDELT's text search can surface an
 * article that mentions the asset's name without the event actually being
 * about it, and Claude's own classification is the real relevance check.
 */
function classificationNamesAsset(
  classification: { commodityImpacts: Array<{ asset: string }>; currencyPairImpacts: Array<{ asset: string }> },
  asset: string,
): boolean {
  return (
    classification.commodityImpacts.some((i) => i.asset === asset) ||
    classification.currencyPairImpacts.some((i) => i.asset === asset)
  );
}

export async function runChartAttributionBackfill(params: {
  asset: string;
  timestampMs: number;
}): Promise<{ results: BackfillResult[] }> {
  const { asset, timestampMs } = params;
  const supabase = getSupabaseAdmin();
  const windowStartMs = timestampMs - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  let articles: GdeltArticle[] = [];
  const fetchStartedAt = Date.now();
  try {
    const res = await axios.get(buildGdeltUrl(asset, windowStartMs, timestampMs), {
      timeout: GDELT_TIMEOUT_MS,
    });
    articles = res.data?.articles ?? [];
    await recordServiceHealth("gdelt", "ok", "chart-attribution-backfill", Date.now() - fetchStartedAt);
  } catch (e: any) {
    console.error("[chart-attribution-backfill] GDELT fetch failed:", e.message);
    await recordServiceHealth(
      "gdelt",
      e?.response?.status === 429 ? "rate_limited" : "error",
      `chart-attribution-backfill: ${e.message}`,
      Date.now() - fetchStartedAt,
    );
    return { results: [] };
  }

  const englishRelevant = articles.filter((a) => {
    if (a.language && a.language.toLowerCase() !== "english") return false;
    return isRelevantEvent(a.title?.slice(0, 280) ?? "");
  });

  // Top candidates by proximity to the clicked timestamp, not just most recent —
  // a chart click on a point 6 days into the window cares about articles near
  // that point, not whichever GDELT happened to return first.
  const byProximity = englishRelevant
    .map((a) => ({ article: a, timeMs: new Date(parseSeenDate(a.seendate)).getTime() }))
    .sort((a, b) => Math.abs(a.timeMs - timestampMs) - Math.abs(b.timeMs - timestampMs))
    .slice(0, CLASSIFY_LIMIT);

  const results: BackfillResult[] = [];

  for (const { article: a } of byProximity) {
    if (!a.url) continue;
    const externalId = articleExternalId("gdelt", a.url);

    const title = a.title?.slice(0, 280) ?? a.url ?? "GDELT article";
    const eventDate = parseSeenDate(a.seendate);
    const country = a.sourcecountry ?? null;

    const existing = await supabase.from("raw_events").select("id").eq("external_id", externalId).maybeSingle();
    if (existing.data?.id) continue;

    const insert = await supabase
      .from("raw_events")
      .insert({
        source: "chart-attribution-backfill",
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
    const rawEventId = insert.data.id as string;

    const pre = await tryTitlePreFilterSkip({
      supabase,
      collectorLabel: "ChartAttributionBackfill",
      rawEventId,
      source: "chart-attribution-backfill",
      title,
    });
    if (pre.skipped) continue;

    try {
      const countryLabel = formatCountryName(country);
      const similarStoryLast48h = await hasSimilarRecentSignal(supabase, {
        country: countryLabel,
        eventType: "news",
      });
      const classification = await claude.classifyEvent(
        { id: rawEventId, title, country, event_type: "news", event_date: eventDate },
        { similarStoryLast48h },
      );

      if (!classification.materialityPass) {
        await logMaterialityRejection({
          collectorLabel: "ChartAttributionBackfill",
          title,
          source: "chart-attribution-backfill",
          classification,
          supabase,
          rawEventId,
        });
        continue;
      }

      if (!classificationNamesAsset(classification, asset)) continue;

      const { lat, lng } = resolveGeoCoords(title, classification.country, country, classification.region);

      const mergeResult = await insertOrMergeSignal({
        supabase,
        collectorLabel: "ChartAttributionBackfill",
        rawEventId,
        classification,
        title,
        eventType: "news",
        eventDate,
        country: formatCountryName(classification.country ?? country),
        lat,
        lng,
        freshness: "cached",
        isBackfilled: true,
      });

      if (!mergeResult.signalId) continue;

      if (mergeResult.outcome === "new" && classification.severity >= 7) {
        try {
          await generateSignalAnalysis(mergeResult.signalId);
        } catch (e) {
          console.error(
            "[chart-attribution-backfill] signal-generation failed:",
            e instanceof Error ? e.message : e,
          );
        }
      }
      // Deliberately no dispatchAlertsForSignal call here for the "new" outcome —
      // Option B (founder decision 2026-09-28): a backfilled row must not surface
      // as a "new signal" alert for an event that's actually days/weeks old. The
      // escalation-path dispatch is separately suppressed inside insertOrMergeSignal
      // itself via isBackfilled.

      const eventMsResolved = new Date(eventDate).getTime();
      results.push({
        id: mergeResult.signalId,
        title,
        eventDate,
        hoursBefore: Math.round((timestampMs - eventMsResolved) / 3_600_000),
        severity: classification.severity,
        backfilled: true,
      });
    } catch (e) {
      console.error(
        "[chart-attribution-backfill] classification/insert failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Matches the DB-first path's ordering promise ("shown by severity" — see
  // app/(dashboard)/watchlist/[symbol]/page.tsx's disclaimer copy).
  results.sort((a, b) => b.severity - a.severity);
  return { results };
}
