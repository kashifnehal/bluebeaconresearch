import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rateLimitOrPass } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HISTORY_POINTS = 12;
const MAX_DAYS = 90;
const MAX_RANGE_POINTS = 2000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "missing_symbol" }, { status: 400 });
  }
  // `days` opts into a date-range window (used by the watchlist drill-down chart);
  // omitting it preserves the original "last N snapshots" behavior the sparkline relies on.
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? Math.min(MAX_DAYS, Math.max(1, Number(daysParam) || 0)) : null;

  // No auth check (same as /api/prices — public market data), but still rate-limited.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    const rl = await rateLimitOrPass(`prices-history:${ip}`);
    if (!rl.success) {
      return NextResponse.json({ points: [] }, { status: 429 });
    }
  } catch (err) {
    console.warn("⚠️ [API Prices History] Rate limit check failed, continuing:", err);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ points: [] });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  let query = supabase.from("commodity_prices").select("price, fetched_at").eq("symbol", symbol);

  if (days) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte("fetched_at", cutoff).order("fetched_at", { ascending: true }).limit(MAX_RANGE_POINTS);
  } else {
    query = query.order("fetched_at", { ascending: false }).limit(HISTORY_POINTS);
  }

  const { data, error } = await query;

  if (error || !data) {
    return NextResponse.json({ points: [] });
  }

  const rows = days ? data : [...data].reverse();
  const points = rows.map((r) => ({ price: r.price, fetchedAt: r.fetched_at as string }));
  return NextResponse.json({ points });
}
