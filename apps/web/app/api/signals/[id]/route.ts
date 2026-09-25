import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError, apiErrorLogged } from "@/lib/api-response";
import type { Signal } from "@blue-beacon-research/shared";
import { loadMediaImpactCaveats } from "@/lib/media-impact-watchlist";
import {
  parseEventCategory,
  parseNovelty,
  parseSourceConfirmation,
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

export type EventDetailResponse = {
  signal: Signal;
  sources: EventSource[];
  historicalComparisons: HistoricalComparison[];
  relatedEvents: RelatedEvent[];
  pricesAtSignal: PriceAtSignal[];
};

// Placeholder, not a tuned value — no usage data exists yet on how far back a
// "related" event should reach. Revisit once #185-style related-event views have
// real traffic. See signal-merge.ts's SIMILARITY_THRESHOLD comment for the same
// pattern applied to a value that *does* have real backtest evidence behind it.
const RELATED_EVENTS_WINDOW_DAYS = 7;
const RELATED_EVENTS_LIMIT = 10;

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
) {
  const { id } = await params;
  if (!id) {
    return apiError(400, "missing_id");
  }

  const clients = await getRouteSupabaseClients();
  if (!clients) {
    return apiError(500, "config_error");
  }
  const { supabase, user } = clients;

  if (!user && process.env.NODE_ENV === "production") {
    return apiError(401, "unauthorized");
  }

  const { data: row, error } = await supabase
    .from("signals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[signals/:id] DB error:", error.message);
    return apiErrorLogged(500, "db_error", error);
  }

  if (!row) {
    return apiError(404, "not_found");
  }

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

  const [rawEventsRes, historicalRes, relatedRes] = await Promise.all([
    rawEventIds.length > 0
      ? supabase
          .from("raw_events")
          .select("id, title, event_date, created_at, raw_data")
          .in("id", rawEventIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase
      .from("signals")
      .select("id, title, event_date, created_at, severity, country, commodity_impacts")
      .neq("id", id)
      .or(
        [row.event_type ? `event_type.eq.${row.event_type}` : null, row.region ? `region.eq.${row.region}` : null]
          .filter(Boolean)
          .join(","),
      )
      .order("event_date", { ascending: false })
      .limit(4),
    // Related Events (Phase 2): same country AND overlapping commodity, not the
    // broader region-based guess historicalComparisons above uses — an AND with
    // country, not an OR with region, per the explicit correction that a
    // region-only match would make almost everything "related".
    row.country && ownCommodityAssets.length > 0
      ? supabase
          .from("signals")
          .select("id, title, event_date, created_at, country, commodity_impacts, raw_event_ids")
          .neq("id", id)
          .eq("country", row.country)
          .gte("event_date", relatedWindowStart)
          .lte("event_date", row.event_date ?? row.created_at)
          .order("event_date", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const sources: EventSource[] = (rawEventsRes.data ?? [])
    .map((re: any) => ({
      title: re.title ?? "Untitled source",
      url: re.raw_data?.url ?? null,
      sourceLabel: re.raw_data?.source ?? null,
      domain: re.raw_data?.domain ?? null,
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

  const relatedEvents: RelatedEvent[] = (relatedRes.data ?? [])
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
    .filter((e: RelatedEvent | null): e is RelatedEvent => e !== null)
    .slice(0, RELATED_EVENTS_LIMIT);

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
  const currencyPairImpacts = (row.currency_pair_impacts ?? []) as Signal["currencyPairImpacts"];
  const eventDate = row.event_date ?? row.created_at;

  const pricesAtSignal: PriceAtSignal[] = await Promise.all(
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

  const mediaImpactCaveats = await loadMediaImpactCaveats(supabase);
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
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    eventDate,
  };

  const payload: EventDetailResponse = {
    signal,
    sources,
    historicalComparisons,
    relatedEvents,
    pricesAtSignal,
  };

  return NextResponse.json(payload);
}
