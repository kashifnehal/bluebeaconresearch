import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Redis } from "@upstash/redis";

type CommodityPriceRow = {
  symbol: string;
  price: number;
  change_24h: number;
  change_pct_24h: number;
  high_24h: number;
  low_24h: number;
  fetched_at: string;
};

const SYMBOLS = ["USOIL", "UKOIL", "XAUUSD", "NGAS", "WHEAT", "COPPER", "XAGUSD", "CORN"] as const;

const FALLBACK_PRICES: Record<string, Omit<CommodityPriceRow, "symbol" | "fetched_at">> = {
  USOIL: { price: 78.50, change_24h: 0.42, change_pct_24h: 0.54, high_24h: 79.20, low_24h: 77.80 },
  UKOIL: { price: 82.30, change_24h: -0.15, change_pct_24h: -0.18, high_24h: 83.10, low_24h: 81.50 },
  XAUUSD: { price: 2340.0, change_24h: 8.50, change_pct_24h: 0.36, high_24h: 2355.0, low_24h: 2325.0 },
  NGAS: { price: 2.85, change_24h: 0.04, change_pct_24h: 1.42, high_24h: 2.92, low_24h: 2.78 },
  WHEAT: { price: 540.0, change_24h: -4.50, change_pct_24h: -0.83, high_24h: 548.0, low_24h: 532.0 },
  COPPER: { price: 4.25, change_24h: 0.02, change_pct_24h: 0.47, high_24h: 4.30, low_24h: 4.18 },
  XAGUSD: { price: 27.50, change_24h: 0.30, change_pct_24h: 1.10, high_24h: 28.10, low_24h: 27.10 },
  CORN: { price: 450.0, change_24h: 2.10, change_pct_24h: 0.47, high_24h: 455.0, low_24h: 442.0 },
};

function getUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET() {
  const priceMap = new Map<string, CommodityPriceRow>();

  // Tier 1: Try querying Supabase commodity_prices table first
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseAnonKey) {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      });

      const { data, error } = await supabase
        .from("commodity_prices")
        .select("symbol,price,change_24h,change_pct_24h,high_24h,low_24h,fetched_at")
        .order("fetched_at", { ascending: false })
        .limit(100);

      if (!error && data?.length) {
        for (const row of data) {
          if (row.symbol && typeof row.price === "number" && !priceMap.has(row.symbol)) {
            priceMap.set(row.symbol, {
              symbol: row.symbol,
              price: row.price,
              change_24h: row.change_24h ?? 0,
              change_pct_24h: row.change_pct_24h ?? 0,
              high_24h: row.high_24h ?? row.price,
              low_24h: row.low_24h ?? row.price,
              fetched_at: row.fetched_at ?? new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("⚠️ [API Prices] Supabase DB fetch failed, using fallback chain:", err);
  }

  // Tier 2: For any missing symbols, try fetching from Redis cache
  const missingSymbols = SYMBOLS.filter((s) => !priceMap.has(s));
  if (missingSymbols.length > 0) {
    try {
      const redis = getUpstashRedis();
      if (redis) {
        for (const sym of missingSymbols) {
          const cached = await redis.get<string | object>(`prices:${sym}`);
          if (cached) {
            const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
            if (parsed && typeof parsed.price === "number") {
              priceMap.set(sym, {
                symbol: sym,
                price: parsed.price,
                change_24h: parsed.change_24h ?? 0,
                change_pct_24h: parsed.change_pct_24h ?? 0,
                high_24h: parsed.high_24h ?? parsed.price,
                low_24h: parsed.low_24h ?? parsed.price,
                fetched_at: parsed.fetched_at ?? new Date().toISOString(),
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ [API Prices] Redis cache fetch failed:", err);
    }
  }

  // Tier 3: For any remaining missing symbols, use hardcoded static fallbacks
  const now = new Date().toISOString();
  for (const sym of SYMBOLS) {
    if (!priceMap.has(sym)) {
      const fallback = FALLBACK_PRICES[sym] ?? { price: 100.0, change_24h: 0, change_pct_24h: 0, high_24h: 100.0, low_24h: 100.0 };
      priceMap.set(sym, {
        symbol: sym,
        ...fallback,
        fetched_at: now,
      });
    }
  }

  return NextResponse.json({ prices: Array.from(priceMap.values()) });
}
