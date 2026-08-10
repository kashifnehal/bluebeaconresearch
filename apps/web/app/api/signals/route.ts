import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rateLimitOrPass } from "@/lib/ratelimit";
import type { Signal } from "@blue-beacon-research/shared";

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ signals: [], nextCursor: null, total: 0 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  const url = new URL(req.url);
  const severity = url.searchParams.get("severity");
  const region = url.searchParams.get("region");
  const commodity = url.searchParams.get("commodity");
  const sort = url.searchParams.get("sort") ?? "severity";

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
    console.error("[signals] DB error:", error.message);
    return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 });
  }

  const signals: Signal[] = (data ?? []).map((row) => {
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
