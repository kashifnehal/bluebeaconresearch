import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-response";
import type { Signal } from "@blue-beacon-research/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type EventSource = {
  title: string;
  url: string | null;
  sourceLabel: string | null;
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
  pricesAtSignal: PriceAtSignal[];
};

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
    return apiError(500, "db_error", error.message);
  }

  if (!row) {
    return apiError(404, "not_found");
  }

  const rawEventIds: string[] = row.raw_event_ids ?? [];

  const [rawEventsRes, historicalRes] = await Promise.all([
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
  ]);

  const sources: EventSource[] = (rawEventsRes.data ?? []).map((re: any) => ({
    title: re.title ?? "Untitled source",
    url: re.raw_data?.url ?? null,
    sourceLabel: re.raw_data?.source ?? null,
    publishedAt: re.event_date ?? re.created_at ?? null,
  }));

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
    sanctionsMatches: row.sanctions_matches ?? undefined,
    isBreaking: row.is_breaking ?? false,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    eventDate,
  };

  const payload: EventDetailResponse = {
    signal,
    sources,
    historicalComparisons,
    pricesAtSignal,
  };

  return NextResponse.json(payload);
}
