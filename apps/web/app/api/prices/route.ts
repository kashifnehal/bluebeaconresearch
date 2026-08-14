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

// Step 3: Server-side in-memory cache for /api/prices (60s TTL)
let _cachedPrices: { payload: { prices: CommodityPriceRow[] }; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60s in-memory cache

function getUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET() {
  const now = Date.now();

  // Short-circuit: return in-memory cached prices if fresh (under 60s old)
  if (_cachedPrices && now - _cachedPrices.timestamp <= CACHE_TTL_MS) {
    return NextResponse.json(_cachedPrices.payload, {
      headers: { "x-prices-cache-status": "hit" },
    });
  }

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

  const payload = { prices: Array.from(priceMap.values()) };

  // Store in memory cache if we got results, or extend existing cache under DB failure
  if (payload.prices.length > 0) {
    _cachedPrices = { payload, timestamp: now };
  } else if (_cachedPrices) {
    console.warn("⚠️ [API Prices] Empty fetch — serving stale cached prices");
    return NextResponse.json(_cachedPrices.payload, {
      headers: { "x-prices-cache-status": "stale-fallback" },
    });
  }

  return NextResponse.json(payload);
}
