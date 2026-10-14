import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError, apiErrorLogged } from "@/lib/api-response";
import type { Signal } from "@blue-beacon-research/shared";
import { loadMediaImpactCaveats } from "@/lib/media-impact-watchlist";
import {
  fetchSignalOutcomeRows,
  type OutcomeRowsObservation,
} from "@/lib/signal-outcomes-server";
import {
  BASELINE_FETCH_TIMEOUT_MS,
  fetchMatchedBaselinesWithTimeout,
  prefetchAssetPricePoints,
  type BaselineFetchTiming,
  type PricePointsTiming,
} from "@/lib/price-baseline-server";
import { formatServerTiming, serverTimingEnabled, type ServerTimingStep } from "@/lib/server-timing";
import type { WindowMoveBaseline } from "@/lib/price-baseline";
import { fetchAllRangedRows } from "@/lib/paged-range-fetch";
import { RELATED_EVENTS_PAGE_SIZE } from "@/lib/related-events";
import { sourceHostname } from "@/lib/source-host";
import {
  MARKET_IMPACT_CHECKPOINT_HOURS,
  computeMarketImpactCheckpoints,
  computeMarketImpactMagnitude,
  deriveTimeHorizonLabel,
  parseEventCategory,
  parseNovelty,
  parseSourceConfirmation,
  type MarketImpactCheckpointPoint,
  type MarketImpactMagnitude,
  type TimeHorizonLabel,
} from "@/lib/market-impact-assessment";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type EventSource = {
  title: string;
  url: string | null;
  sourceLabel: string | null;
  domain: string | null;
  publishedAt: string | null;
};

export type HistoricalComparison = {
  id: string;
  title: string;
  eventDate: string | null;
  severity: number;
  country: string | null;
  commodityImpacts: Signal["commodityImpacts"];
};

export type RelatedEventMatchLabel = "reinforcing" | "conflicting" | "mixed";

export type RelatedEvent = {
  id: string;
  title: string;
  country: string | null;
  eventDate: string | null;
  sharedCommodities: string[];
  matchLabel: RelatedEventMatchLabel;
  reason: string;
};

export type PriceAtSignal = {
  asset: string;
  priceAtSignal: number | null;
  priceAtSignalDate: string | null;
  currentPrice: number | null;
  currentPriceDate: string | null;
};

export type MarketImpactAssessmentEntry = {
  magnitude: MarketImpactMagnitude | null;
  timeHorizonLabel: TimeHorizonLabel | null;
  checkpoints: MarketImpactCheckpointPoint[];
  baselines: WindowMoveBaseline[];
};

export type EventDetailResponse = {
  signal: Signal;
  sources: EventSource[];
  historicalComparisons: HistoricalComparison[];
  relatedEvents: RelatedEvent[];
  relatedEventsTotal: number;
  pricesAtSignal: PriceAtSignal[];
  marketImpactMagnitudes: Record<string, MarketImpactAssessmentEntry>;
};

// Placeholder, not a tuned value — no usage data exists yet on how far back a
// "related" event should reach. Revisit once #185-style related-event views have
// real traffic. See signal-merge.ts's SIMILARITY_THRESHOLD comment for the same
// pattern applied to a value that *does* have real backtest evidence behind it.
const RELATED_EVENTS_WINDOW_DAYS = 7;

type SignalDetailDeps = {
  getRouteSupabaseClients: typeof getRouteSupabaseClients;
  fetchSignalOutcomeRows: typeof fetchSignalOutcomeRows;
  prefetchAssetPricePoints: typeof prefetchAssetPricePoints;
  fetchMatchedBaselinesWithTimeout: typeof fetchMatchedBaselinesWithTimeout;
  loadMediaImpactCaveats: typeof loadMediaImpactCaveats;
};

const defaultSignalDetailDeps: SignalDetailDeps = {
  getRouteSupabaseClients,
  fetchSignalOutcomeRows,
  prefetchAssetPricePoints,
  fetchMatchedBaselinesWithTimeout,
  loadMediaImpactCaveats,
};

function timeAwait<T>(
  promise: PromiseLike<T>,
  timingOn: boolean,
): { promise: PromiseLike<T>; ms: () => number } {
  if (!timingOn) return { promise, ms: () => 0 };
  let dur = 0;
  const timed = (async () => {
    const started = performance.now();
    try {
      return await promise;
    } finally {
      dur = performance.now() - started;
    }
  })();
  return { promise: timed, ms: () => dur };
}
// RELATED_EVENTS_PAGE_SIZE (display count, not a query cap) lives in
// @/lib/related-events — see that file for why it isn't re-exported from here.

type RelatedCandidateRow = {
  id: string;
  title: string;
  country: string | null;
  event_date: string | null;
  created_at: string | null;
  commodity_impacts: Signal["commodityImpacts"] | null;
  raw_event_ids: string[] | null;
};

function seendateToIso(seendate: unknown): string | null {
  // GDELT's raw_data.seendate is "20260905T160000Z" (no separators), not ISO-8601.
  if (typeof seendate !== "string" || seendate.length < 15) return null;
  const iso = `${seendate.slice(0, 4)}-${seendate.slice(4, 6)}-${seendate.slice(6, 8)}T${seendate.slice(9, 11)}:${seendate.slice(11, 13)}:${seendate.slice(13, 15)}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : iso;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  deps: SignalDetailDeps = defaultSignalDetailDeps,
) {
  const { id } = await params;
  if (!id) {
    return apiError(400, "missing_id");
  }

  const timingOn = serverTimingEnabled();
  const steps: ServerTimingStep[] | null = timingOn ? [] : null;
  const withTiming = (response: NextResponse) => {
    if (steps && steps.length > 0) {
      response.headers.set("Server-Timing", formatServerTiming(steps));
    }
    return response;
  };
  const started = () => (timingOn ? performance.now() : 0);
  const note = (name: string, t0: number, desc?: string) => {
    if (!steps) return;
    steps.push({ name, durMs: performance.now() - t0, desc });
  };

  const authStarted = started();
  const clients = await deps.getRouteSupabaseClients();
  if (!clients) {
    note("auth", authStarted);
    return withTiming(apiError(500, "config_error"));
  }
  const { supabase, user } = clients;

  if (!user && process.env.NODE_ENV === "production") {
    note("auth", authStarted);
    return withTiming(apiError(401, "unauthorized"));
  }
  note("auth", authStarted);

  const signalStarted = started();
  const { data: row, error } = await supabase
    .from("signals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    note("signal", signalStarted);
    console.error("[signals/:id] DB error:", error.message);
    return withTiming(apiErrorLogged(500, "db_error", error));
  }

  if (!row) {
    note("signal", signalStarted);
    return withTiming(apiError(404, "not_found"));
  }
  note("signal", signalStarted);

  const rawEventIds: string[] = row.raw_event_ids ?? [];
  const ownCommodityAssets: string[] = ((row.commodity_impacts ?? []) as Signal["commodityImpacts"]).map(
    (c) => c.asset,
  );
  // Anchored to this event's own event_date, not wall-clock "now" — otherwise an
  // event from weeks ago would never show anything as related. Same pattern
  // signal-merge.ts's MATCH_WINDOW_HOURS already uses (window centered on the
  // article being processed, not on the current request time).
  const relatedAnchor = new Date(row.event_date ?? row.created_at).getTime();
  const relatedWindowStart = new Date(
    relatedAnchor - RELATED_EVENTS_WINDOW_DAYS * 24 * 3_600_000,
  ).toISOString();

  const rawEventsPromise =
    rawEventIds.length > 0
      ? supabase
          .from("raw_events")
          .select("id, title, event_date, created_at, raw_data")
          .in("id", rawEventIds)
      : Promise.resolve({ data: [] as any[], error: null });
  const historicalPromise = supabase
    .from("signals")
    .select("id, title, event_date, created_at, severity, country, commodity_impacts")
    .neq("id", id)
    .or(
      [row.event_type ? `event_type.eq.${row.event_type}` : null, row.region ? `region.eq.${row.region}` : null]
        .filter(Boolean)
        .join(","),
    )
    .order("event_date", { ascending: false })
    .limit(4);
  // Related Events (Phase 2): same country AND overlapping commodity, not the
  // broader region-based guess historicalComparisons above uses — an AND with
  // country, not an OR with region, per the explicit correction that a
  // region-only match would make almost everything "related".
  //
  // Paged with .range() rather than a bare .limit(50) — the same proven pattern
  // as apps/web/app/api/signals/driver-breakdown/route.ts's fetchImpactRows. A
  // fixed .limit(50) candidate pool meant the real highest-relevance matches
  // beyond the 50th DB row were never even considered, let alone shown (audit
  // #276). The response-level display cap is RELATED_EVENTS_PAGE_SIZE, applied
  // after scoring, below.
  const relatedPromise =
    row.country && ownCommodityAssets.length > 0
      ? fetchAllRangedRows<RelatedCandidateRow>((from, to) =>
          supabase
            .from("signals")
            .select("id, title, event_date, created_at, country, commodity_impacts, raw_event_ids")
            .neq("id", id)
            .eq("country", row.country)
            .gte("event_date", relatedWindowStart)
            .lte("event_date", row.event_date ?? row.created_at)
            .order("event_date", { ascending: false })
            .range(from, to),
        )
      : Promise.resolve({ rows: [] as RelatedCandidateRow[], error: null });
  const watchedRawEvents = timeAwait(rawEventsPromise, timingOn);
  const watchedHistorical = timeAwait(historicalPromise, timingOn);
  const watchedRelated = timeAwait(relatedPromise, timingOn);

  const [rawEventsRes, historicalRes, relatedRes] = (await Promise.all([
    watchedRawEvents.promise,
    watchedHistorical.promise,
    watchedRelated.promise,
  ])) as [
    { data: any[] | null; error: { message: string } | null },
    { data: any[] | null; error: { message: string } | null },
    { rows: RelatedCandidateRow[]; error: string | null },
  ];
  if (steps) {
    steps.push({ name: "raw_events", durMs: watchedRawEvents.ms() });
    steps.push({ name: "historical", durMs: watchedHistorical.ms() });
    steps.push({ name: "related", durMs: watchedRelated.ms() });
  }

  const sources: EventSource[] = (rawEventsRes.data ?? [])
    .map((re: any) => ({
      title: re.title ?? "Untitled source",
      url: re.raw_data?.url ?? null,
      sourceLabel: re.raw_data?.source ?? null,
      domain: re.raw_data?.domain ?? sourceHostname(re.raw_data?.url) ?? null,
      publishedAt: re.event_date ?? seendateToIso(re.raw_data?.seendate) ?? re.created_at ?? null,
    }))
    // Timeline is oldest-first; entries with no resolvable date sort last.
    .sort((a: EventSource, b: EventSource) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : Infinity;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : Infinity;
      return ta - tb;
    });

  function matchLabelFor(direction: string, otherDirection: string): RelatedEventMatchLabel {
    if (direction === otherDirection && (direction === "up" || direction === "down")) return "reinforcing";
    if (
      (direction === "up" && otherDirection === "down") ||
      (direction === "down" && otherDirection === "up")
    ) {
      return "conflicting";
    }
    return "mixed";
  }

  if (relatedRes.error) {
    console.error("[signals/:id] related events paging error:", relatedRes.error);
  }

  const relatedEventsFull: RelatedEvent[] = relatedRes.rows
    .filter((candidate: any) => {
      // Exclude anything already folded into this signal's own merge group.
      const candidateRawIds: string[] = candidate.raw_event_ids ?? [];
      return !candidateRawIds.some((rid) => rawEventIds.includes(rid));
    })
    .map((candidate: any) => {
      const candidateImpacts = (candidate.commodity_impacts ?? []) as Signal["commodityImpacts"];
      const shared = candidateImpacts.filter((c) => ownCommodityAssets.includes(c.asset));
      if (shared.length === 0) return null;

      const labels = shared.map((c) => {
        const ownImpact = ((row.commodity_impacts ?? []) as Signal["commodityImpacts"]).find(
          (o) => o.asset === c.asset,
        );
        return matchLabelFor(ownImpact?.direction ?? "neutral", c.direction);
      });
      // One shared-commodity pair conflicting is enough to call the overall match
      // "mixed" rather than quietly picking the first label.
      const matchLabel: RelatedEventMatchLabel = labels.every((l) => l === "reinforcing")
        ? "reinforcing"
        : labels.every((l) => l === "conflicting")
          ? "conflicting"
          : "mixed";

      const sharedCommodities = shared.map((c) => c.asset);
      const entry: RelatedEvent = {
        id: candidate.id,
        title: candidate.title,
        country: candidate.country,
        eventDate: candidate.event_date ?? candidate.created_at ?? null,
        sharedCommodities,
        matchLabel,
        reason: `Same country (${candidate.country}) and shared commodity exposure: ${sharedCommodities.join(", ")}`,
      };
      return entry;
    })
    .filter((e: RelatedEvent | null): e is RelatedEvent => e !== null);

  // The full, correctly-scored match set is sent to the client rather than sliced
  // here — the event-detail page reveals it RELATED_EVENTS_PAGE_SIZE at a time via
  // its own "Load more", the same already-fetched-then-paginated-client-side
  // approach the Alerts page's per-rule match list uses. This keeps the "Showing
  // 50 of N" count and every subsequent page honest without a second round trip.
  const relatedEvents = relatedEventsFull;
  const relatedEventsTotal = relatedEventsFull.length;

  const historicalComparisons: HistoricalComparison[] = (historicalRes.data ?? []).map(
    (h: any) => ({
      id: h.id,
      title: h.title,
      eventDate: h.event_date ?? h.created_at ?? null,
      severity: h.severity,
      country: h.country,
      commodityImpacts: h.commodity_impacts ?? [],
    }),
  );

  const commodityImpacts = (row.commodity_impacts ?? []) as Signal["commodityImpacts"];
  const currencyPairImpacts = (row.currency_pair_impacts ?? []) as NonNullable<
    Signal["currencyPairImpacts"]
  >;
  const eventDate = row.event_date ?? row.created_at;

  const pricesAtSignalPromise = Promise.all(
    commodityImpacts.map(async (impact) => {
      const [historicalPriceRes, currentPriceRes] = await Promise.all([
        supabase
          .from("commodity_prices")
          .select("price, fetched_at")
          .eq("symbol", impact.asset)
          .lte("fetched_at", eventDate)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("commodity_prices")
          .select("price, fetched_at")
          .eq("symbol", impact.asset)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        asset: impact.asset,
        priceAtSignal: historicalPriceRes.data?.price ?? null,
        priceAtSignalDate: historicalPriceRes.data?.fetched_at ?? null,
        currentPrice: currentPriceRes.data?.price ?? null,
        currentPriceDate: currentPriceRes.data?.fetched_at ?? null,
      };
    }),
  );
  const watchedPricesAtSignal = timeAwait(pricesAtSignalPromise, timingOn);
  const pricesAtSignal: PriceAtSignal[] = await watchedPricesAtSignal.promise;
  if (steps) {
    steps.push({ name: "price_at_signal", durMs: watchedPricesAtSignal.ms() });
  }

  const magnitudeAssets = [
    ...new Set([
      ...commodityImpacts.map((c) => c.asset),
      ...currencyPairImpacts.map((c) => c.asset),
    ]),
  ];

  let marketImpactMagnitudes: Record<string, MarketImpactAssessmentEntry> = {};
  let responseMs = 0;
  if (magnitudeAssets.length > 0) {
    const pricePoints: PricePointsTiming | undefined = timingOn
      ? { ms: 0, pending: 0, startedAt: null, cacheStatus: "hit" }
      : undefined;
    const outcomeWatch: OutcomeRowsObservation | undefined = timingOn
      ? { cacheStatus: "miss" }
      : undefined;
    const baselineTiming: BaselineFetchTiming | undefined = timingOn
      ? { timedOut: false, pricePoints }
      : undefined;

    if (pricePoints) deps.prefetchAssetPricePoints(supabase, magnitudeAssets, pricePoints);
    else deps.prefetchAssetPricePoints(supabase, magnitudeAssets);

    const outcomesStarted = started();
    const rows = outcomeWatch
      ? await deps.fetchSignalOutcomeRows(supabase, magnitudeAssets, outcomeWatch)
      : await deps.fetchSignalOutcomeRows(supabase, magnitudeAssets);
    const outcomesMs = timingOn ? performance.now() - outcomesStarted : 0;

    const baselinesStarted = started();
    const baselinesByAsset = baselineTiming
      ? await deps.fetchMatchedBaselinesWithTimeout(
          supabase,
          magnitudeAssets,
          rows,
          BASELINE_FETCH_TIMEOUT_MS,
          baselineTiming,
        )
      : await deps.fetchMatchedBaselinesWithTimeout(supabase, magnitudeAssets, rows);
    const baselinesMs = timingOn ? performance.now() - baselinesStarted : 0;

    if (steps && pricePoints) {
      const stillOpen = pricePoints.pending > 0 && pricePoints.startedAt !== null;
      steps.push({
        name: "outcomes",
        durMs: outcomesMs,
        desc: outcomeWatch?.cacheStatus ?? "miss",
      });
      steps.push({
        name: "prices",
        durMs: stillOpen ? performance.now() - (pricePoints.startedAt as number) : pricePoints.ms,
        desc: stillOpen ? "open" : pricePoints.cacheStatus,
      });
      steps.push({
        name: "baselines",
        durMs: baselinesMs,
        desc: baselineTiming?.timedOut ? "timeout" : "ok",
      });
    }

    const buildStarted = started();
    marketImpactMagnitudes = Object.fromEntries(
      magnitudeAssets.map((asset) => [
        asset,
        {
          magnitude: computeMarketImpactMagnitude(
            rows,
            asset,
            MARKET_IMPACT_CHECKPOINT_HOURS,
          ),
          timeHorizonLabel: deriveTimeHorizonLabel(rows, asset),
          checkpoints: computeMarketImpactCheckpoints(rows, asset),
          baselines: baselinesByAsset[asset] ?? [],
        } satisfies MarketImpactAssessmentEntry,
      ]),
    );
    if (timingOn) responseMs += performance.now() - buildStarted;
  } else if (steps) {
    steps.push({ name: "outcomes", durMs: 0, desc: "skip" });
    steps.push({ name: "prices", durMs: 0, desc: "skip" });
    steps.push({ name: "baselines", durMs: 0, desc: "skip" });
  }

  const mediaStarted = started();
  const mediaImpactCaveats = await deps.loadMediaImpactCaveats(supabase);
  note("media", mediaStarted);
  const assembleStarted = started();
  const mediaImpactEntity =
    typeof row.media_impact_entity === "string" && row.media_impact_entity.trim()
      ? row.media_impact_entity
      : null;

  const signal: Signal = {
    id: row.id,
    title: row.title,
    summary: row.summary,
    aiAnalysis: row.ai_analysis ?? undefined,
    severity: row.severity,
    confidence: row.confidence,
    eventType: row.event_type,
    country: row.country,
    region: row.region,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    sourcesCount: row.sources_count ?? 1,
    commodityImpacts,
    currencyPairImpacts,
    sanctionsMatches: row.sanctions_matches ?? undefined,
    isBreaking: row.is_breaking ?? false,
    isActive: row.is_active ?? true,
    classificationMethod: row.classification_method ?? null,
    mediaImpactEntity,
    mediaImpactCaveat: mediaImpactEntity
      ? (mediaImpactCaveats.get(mediaImpactEntity) ?? null)
      : null,
    eventCategory: parseEventCategory(row.event_category),
    marketMechanism:
      typeof row.market_mechanism === "string" && row.market_mechanism.trim()
        ? row.market_mechanism.trim()
        : null,
    isPreview: row.is_preview === true,
    novelty: parseNovelty(row.novelty),
    sourceConfirmation: parseSourceConfirmation(row.source_confirmation),
    materialityReasoning:
      typeof row.materiality_reasoning === "string" &&
      row.materiality_reasoning.trim()
        ? row.materiality_reasoning.trim()
        : null,
    invalidationCondition:
      typeof row.invalidation_condition === "string" &&
      row.invalidation_condition.trim()
        ? row.invalidation_condition.trim()
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    eventDate,
  };

  const payload: EventDetailResponse = {
    signal,
    sources,
    historicalComparisons,
    relatedEvents,
    relatedEventsTotal,
    pricesAtSignal,
    marketImpactMagnitudes,
  };

  const response = NextResponse.json(payload);
  if (timingOn) responseMs += performance.now() - assembleStarted;
  if (steps) steps.push({ name: "response", durMs: responseMs });
  return withTiming(response);
}
