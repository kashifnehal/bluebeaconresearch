import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rateLimitOrPass } from "@/lib/ratelimit";
import type { Signal } from "@geosignal/shared";

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
    (data ?? []).map((row: any) => ({
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
      commodityImpacts: row.commodity_impacts ?? [],
      sanctionsMatches: row.sanctions_matches ?? undefined,
      shippingProximity: row.shipping_proximity ?? undefined,
      isBreaking: row.is_breaking ?? false,
      isActive: row.is_active ?? true,
      createdAt: row.created_at,
    })) ?? [];

  return NextResponse.json({ signals, nextCursor: null, total: count ?? signals.length });
}

