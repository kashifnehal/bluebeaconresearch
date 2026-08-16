import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { rateLimitOrPass } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HISTORY_POINTS = 12;

export async function GET(req: NextRequest) {
  const symbol = new URL(req.url).searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "missing_symbol" }, { status: 400 });
  }

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

  const { data, error } = await supabase
    .from("commodity_prices")
    .select("price, fetched_at")
    .eq("symbol", symbol)
    .order("fetched_at", { ascending: false })
    .limit(HISTORY_POINTS);

  if (error || !data) {
    return NextResponse.json({ points: [] });
  }

  const points = data.map((r) => r.price).reverse();
  return NextResponse.json({ points });
}
