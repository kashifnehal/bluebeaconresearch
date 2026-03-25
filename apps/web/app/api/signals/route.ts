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
      title: "Naval incident near key shipping chokepoint",
      summary: "Escalation increases supply risk; oil volatility likely.",
      aiAnalysis: "",
      severity: 9,
      confidence: 0.78,
      eventType: "Naval escalation",
      country: "Yemen",
      region: "middle-east",
      lat: 15.3694,
      lng: 44.191,
      sourcesCount: 3,
      commodityImpacts: [
        { asset: "USOIL", direction: "up", confidence: 0.7 },
        { asset: "UKOIL", direction: "volatile", confidence: 0.6 },
      ],
      isBreaking: true,
      isActive: true,
      createdAt: new Date(now - 12 * 60 * 1000).toISOString(),
    },
    {
      id: "mock-2",
      title: "Sanctions announcement targets energy exports",
      summary: "FX pressure and energy price premium expected.",
      aiAnalysis: "",
      severity: 8,
      confidence: 0.74,
      eventType: "Sanctions",
      country: "Russia",
      region: "eastern-europe",
      sourcesCount: 5,
      commodityImpacts: [
        { asset: "EURUSD", direction: "down", confidence: 0.55 },
        { asset: "NGAS", direction: "up", confidence: 0.62 },
      ],
      isBreaking: false,
      isActive: true,
      createdAt: new Date(now - 55 * 60 * 1000).toISOString(),
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
    return NextResponse.json({ signals: mockSignals(), nextCursor: null, total: 2 });
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

  if (error) {
    return NextResponse.json({ signals: mockSignals(), nextCursor: null, total: 2 });
  }

  const signals: Signal[] =
    (data ?? []).map((row) => {
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
    }) ?? [];

  return NextResponse.json({ signals, nextCursor: null, total: count ?? signals.length });
}

