import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { rateLimitOrPass } from "@/lib/ratelimit";
import type { Signal } from "@blue-beacon-research/shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  raw_event_ids: string[] | null;
  created_at: string;
  updated_at: string | null;
  event_date: string | null;
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
  const supabaseAuth = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  // Require authenticated session for dashboard data (matches RLS policy).
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ signals: [], nextCursor: null, total: 0 });
  }

  // Prefer service role for server-side reads — avoids RLS/session edge cases on API routes.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase =
    serviceKey && supabaseUrl
      ? createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false },
        })
      : supabaseAuth;

  const url = new URL(req.url);
  const severity = url.searchParams.get("severity");
  const region = url.searchParams.get("region");
  const commodity = url.searchParams.get("commodity");
  const sort = url.searchParams.get("sort") ?? "severity";
  const window =
    url.searchParams.get("window") ?? url.searchParams.get("range");

  let query = supabase
    .from("signals")
    .select("*, event_date", { count: "exact" });
  if (severity) query = query.gte("severity", Number(severity));
  if (region) query = query.eq("region", region);
  if (commodity)
    query = query.contains("commodity_impacts", [{ asset: commodity }]);

  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  if (window === "active") {
    query = query.eq("is_active", true);
  } else if (window === "7d") {
    query = query.gte("event_date", sevenDaysAgo);
  } else if (window === "24h") {
    query = query.gte("event_date", twentyFourHoursAgo);
  } else {
    // Default and "latest" behavior: preserve fresh intelligence while keeping
    // ongoing active/developing events visible beyond 24h.
    query = query.or(`event_date.gte.${twentyFourHoursAgo},is_active.eq.true`);
  }

  // Sort: most recent articles first (within severity tier)
  // event_date = when the article was PUBLISHED (most important for freshness)
  // created_at = when we ingested it (tiebreaker)
  query =
    sort === "newest"
      ? query
          .order("event_date", { ascending: false })
          .order("created_at", { ascending: false })
      : sort === "confidence"
        ? query
            .order("confidence", { ascending: false })
            .order("event_date", { ascending: false })
        : query
            .order("event_date", { ascending: false })
            .order("severity", { ascending: false })
            .order("created_at", { ascending: false });

  const { data, error, count } = await query.limit(20);

  // Fail-safe: if newest signal is older than 15 min or missing, trigger inline auto-ingest asynchronously
  const newestRow = data?.[0];
  if (
    !newestRow ||
    (newestRow.created_at &&
      Date.now() - new Date(newestRow.created_at).getTime() > 15 * 60 * 1000)
  ) {
    const { autoIngestIfStale } = await import("@/lib/auto-ingest");
    autoIngestIfStale().catch(() => {});
  }

  if (error) {
    console.error("[signals] DB error:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch signals" },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as SignalRow[];

  // Batch-fetch event dates from raw_events for all signals that have raw_event_ids
  // This gives us the ARTICLE PUBLISH TIME vs the ingestion time (created_at)
  const allRawEventIds = rows
    .flatMap((r) => r.raw_event_ids ?? [])
    .filter(Boolean)
    .slice(0, 40); // max 40 IDs

  const eventDateMap = new Map<string, string>(); // rawEventId → event_date

  if (allRawEventIds.length > 0) {
    const { data: rawEvents } = await supabase
      .from("raw_events")
      .select("id, event_date")
      .in("id", allRawEventIds);

    for (const re of rawEvents ?? []) {
      if (re.event_date) eventDateMap.set(re.id, re.event_date);
    }
  }

  const signals: Signal[] = rows.map((r) => {
    // Use the article's original publish date if available, else fall back to ingestion time
    const firstRawId = r.raw_event_ids?.[0];
    const eventDate =
      r.event_date ??
      (firstRawId ? eventDateMap.get(firstRawId) : null) ??
      r.created_at;

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
      updatedAt: r.updated_at ?? undefined,
      eventDate, // ← article publish time: what we show as "X ago" in UI
    };
  });

  return NextResponse.json({
    signals,
    nextCursor: null,
    total: count ?? signals.length,
  });
}
