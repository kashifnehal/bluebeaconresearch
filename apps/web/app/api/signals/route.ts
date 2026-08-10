import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rateLimitOrPass } from "@/lib/ratelimit";
import type { Signal } from "@blue-beacon-research/shared";

function mockSignals(): Signal[] {
  const now = Date.now();
  return [
    {
      id: "mock-1",
      title: "Naval incident near key shipping chokepoint in Bab el-Mandeb",
      summary: "Escalation increases maritime supply chain risk; crude oil volatility likely to spike.",
      aiAnalysis: "Satellite analysis confirms maritime disruption near Bab el-Mandeb strait affecting container traffic.",
      severity: 9,
      confidence: 0.88,
      eventType: "Naval escalation",
      country: "Yemen",
      region: "middle-east",
      lat: 15.3694,
      lng: 44.191,
      sourcesCount: 8,
      commodityImpacts: [
        { asset: "USOIL", direction: "up", confidence: 0.85 },
        { asset: "UKOIL", direction: "up", confidence: 0.82 },
      ],
      isBreaking: true,
      isActive: true,
      createdAt: new Date(now - 12 * 60 * 1000).toISOString(),
    },
    {
      id: "mock-2",
      title: "Sanctions announcement targets energy exports",
      summary: "FX pressure and energy price premium expected across European regional markets.",
      aiAnalysis: "Financial intelligence indicates immediate restructuring of European natural gas imports.",
      severity: 8,
      confidence: 0.82,
      eventType: "Sanctions",
      country: "Russia",
      region: "eastern-europe",
      lat: 55.7558,
      lng: 37.6173,
      sourcesCount: 12,
      commodityImpacts: [
        { asset: "EURUSD", direction: "down", confidence: 0.65 },
        { asset: "NGAS", direction: "up", confidence: 0.78 },
      ],
      isBreaking: false,
      isActive: true,
      createdAt: new Date(now - 45 * 60 * 1000).toISOString(),
    },
    {
      id: "mock-3",
      title: "Semiconductor supply chain disruption in Taiwan Strait",
      summary: "Military drills prompt rerouting of commercial freight vessels through alternate shipping lanes.",
      aiAnalysis: "Geospatial radar tracking indicates 35% reduction in maritime transit speed through the strait.",
      severity: 7,
      confidence: 0.79,
      eventType: "Military exercises",
      country: "Taiwan",
      region: "asia-pacific",
      lat: 23.6978,
      lng: 120.9605,
      sourcesCount: 6,
      commodityImpacts: [
        { asset: "SOXX", direction: "down", confidence: 0.72 },
        { asset: "USDJPY", direction: "volatile", confidence: 0.60 },
      ],
      isBreaking: false,
      isActive: true,
      createdAt: new Date(now - 90 * 60 * 1000).toISOString(),
    },
  ];
}

type SignalRow = {
  id: string;
  title: string;
  summary: string;
  ai_analysis: string | null;
  severity: number;
  confidence: number;
  event_type: string;
  country: string;
  region: Signal["region"] | string;
  lat: number | null;
  lng: number | null;
  sources_count: number | null;
  commodity_impacts: Signal["commodityImpacts"] | null;
  sanctions_matches: Signal["sanctionsMatches"] | null;
  is_breaking: boolean | null;
  is_active: boolean | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const rl = await rateLimitOrPass(`signals:${ip}`);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const url = new URL(req.url);
  const severity = url.searchParams.get("severity");
  const region = url.searchParams.get("region");
  const commodity = url.searchParams.get("commodity");
  const sort = url.searchParams.get("sort") ?? "severity";

  // If env missing, return mock data.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ signals: mockSignals(), nextCursor: null, total: mockSignals().length });
  }

  let query = supabase.from("signals").select("*", { count: "exact" });
  if (severity) query = query.gte("severity", Number(severity));
  if (region) query = query.eq("region", region);
  if (commodity) query = query.contains("commodity_impacts", [{ asset: commodity }]);

  query =
    sort === "newest"
      ? query.order("created_at", { ascending: false })
      : sort === "confidence"
        ? query.order("confidence", { ascending: false })
        : query.order("severity", { ascending: false }).order("created_at", { ascending: false });

  const { data, error, count } = await query.limit(20);

  if (error || !data || data.length === 0) {
    return NextResponse.json({ signals: mockSignals(), nextCursor: null, total: mockSignals().length });
  }

  const signals: Signal[] =
    data.map((row) => {
      const r = row as SignalRow;
      return {
        id: r.id,
        title: r.title,
        summary: r.summary,
        aiAnalysis: r.ai_analysis ?? undefined,
        severity: r.severity,
        confidence: r.confidence,
        eventType: r.event_type,
        country: r.country,
        region: r.region as Signal["region"],
        lat: r.lat ?? undefined,
        lng: r.lng ?? undefined,
        sourcesCount: r.sources_count ?? 1,
        commodityImpacts: r.commodity_impacts ?? [],
        sanctionsMatches: r.sanctions_matches ?? undefined,
        isBreaking: r.is_breaking ?? false,
        isActive: r.is_active ?? true,
        createdAt: r.created_at,
      };
    });

  return NextResponse.json({ signals, nextCursor: null, total: count ?? signals.length });
}

