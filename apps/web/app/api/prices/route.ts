import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CommodityPriceRow = {
  symbol: string;
  price: number | null;
  change_24h: number | null;
  change_pct_24h: number | null;
  high_24h: number | null;
  low_24h: number | null;
  fetched_at: string;
};

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  // If commodity_prices exists, return the latest snapshot per symbol.
  const { data, error } = await supabase
    .from("commodity_prices")
    .select("symbol,price,change_24h,change_pct_24h,high_24h,low_24h,fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(200);

  if (!error && data?.length) {
    const latestBySymbol = new Map<string, CommodityPriceRow>();
    for (const row of data as CommodityPriceRow[]) {
      if (!latestBySymbol.has(row.symbol)) latestBySymbol.set(row.symbol, row);
    }
    return NextResponse.json({ prices: Array.from(latestBySymbol.values()) });
  }

  // Bootstrap fallback for local dev before Phase 8 price syncer.
  return NextResponse.json({
    prices: [
      { symbol: "USOIL", price: 82.12, change_24h: 0.42, change_pct_24h: 0.51, high_24h: 82.9, low_24h: 80.4, fetched_at: new Date().toISOString() },
      { symbol: "UKOIL", price: 86.33, change_24h: -0.12, change_pct_24h: -0.14, high_24h: 87.2, low_24h: 85.8, fetched_at: new Date().toISOString() },
      { symbol: "XAUUSD", price: 2174.5, change_24h: 8.2, change_pct_24h: 0.38, high_24h: 2180.1, low_24h: 2159.2, fetched_at: new Date().toISOString() },
      { symbol: "WHEAT", price: 612.2, change_24h: -7.8, change_pct_24h: -1.26, high_24h: 628.0, low_24h: 610.2, fetched_at: new Date().toISOString() },
      { symbol: "NGAS", price: 2.14, change_24h: 0.03, change_pct_24h: 1.42, high_24h: 2.18, low_24h: 2.09, fetched_at: new Date().toISOString() },
      { symbol: "CORN", price: 447.9, change_24h: 2.1, change_pct_24h: 0.47, high_24h: 451.2, low_24h: 442.5, fetched_at: new Date().toISOString() },
      { symbol: "EURUSD", price: 1.0872, change_24h: 0.0011, change_pct_24h: 0.10, high_24h: 1.0890, low_24h: 1.0841, fetched_at: new Date().toISOString() },
      { symbol: "USDRUB", price: 91.42, change_24h: -0.55, change_pct_24h: -0.60, high_24h: 92.1, low_24h: 90.9, fetched_at: new Date().toISOString() },
    ],
  });
}

