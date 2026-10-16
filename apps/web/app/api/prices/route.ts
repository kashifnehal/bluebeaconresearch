import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { FOREX_PAIRS, PRICED_COMMODITIES } from "@blue-beacon-research/shared";
import { rateLimitOrPass } from "@/lib/ratelimit";
import { getRouteSupabaseClients } from "@/lib/supabase-server";

type CommodityPriceRow = {
  symbol: string;
  price: number;
  change_24h: number;
  change_pct_24h: number;
  high_24h: number;
  low_24h: number;
  fetched_at: string;
};

// Tier-2 (Redis fallback) symbol list. Tier 1 (the commodity_prices table query
// below) already returns every symbol the price-syncer writes, forex included;
// this list only bounds which symbols the Redis fallback re-hydrates. Derived
// from priced registry entries + FOREX_PAIRS. News-only tags (provider "none")
// are not in this list and are not written by the price sync.
export const SYMBOLS = [
  ...PRICED_COMMODITIES.map((c) => c.symbol),
  ...FOREX_PAIRS.map((f) => f.symbol),
];

// Step 3: Server-side in-memory cache for /api/prices (60s TTL)
let _cachedPrices: { payload: { prices: CommodityPriceRow[] }; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000; // 60s in-memory cache

// Edge cache window. Engineering choice, 2026-10-16, no published source. Kept short.
export const PRICES_CACHE_CONTROL = "public, s-maxage=30, stale-while-revalidate=60";

function jsonPrices(
  payload: { prices: CommodityPriceRow[]; error?: { code: string; message: string } },
  status = 200,
  extra?: Record<string, string>,
) {
  const headers: Record<string, string> = { ...extra };
  if (status === 200) headers["Cache-Control"] = PRICES_CACHE_CONTROL;
  return NextResponse.json(payload, { status, headers });
}

function getUpstashRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET(req: NextRequest) {
  const now = Date.now();

  // Short-circuit: return in-memory cached prices if fresh (under 60s old)
  if (_cachedPrices && now - _cachedPrices.timestamp <= CACHE_TTL_MS) {
    return jsonPrices(_cachedPrices.payload, 200, { "x-prices-cache-status": "hit" });
  }

  // This route intentionally has no auth check — prices are public market data — but it
  // must not be exempt from rate limiting just because it's unauthenticated.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  try {
    const rl = await rateLimitOrPass(`prices:${ip}`);
    if (!rl.success) {
      if (_cachedPrices) {
        return jsonPrices(_cachedPrices.payload, 200, {
          "x-prices-cache-status": "stale-rate-limited",
        });
      }
      // Rate-limited with no cached payload to serve. This deliberately keeps the
      // `prices: []` key AND adds the standard `error` object, rather than returning
      // the bare apiError() shape — see the "hybrid" note in lib/api-response.ts.
      // Dropping `prices` would crash watchlist/[symbol]/page.tsx, which reads
      // `pricesData?.prices.find(...)` with a non-optional `.prices`. Before this,
      // a 429 was indistinguishable from a genuine "no prices available" response.
      return jsonPrices(
        { prices: [], error: { code: "rate_limited", message: "rate_limited" } },
        429,
      );
    }
  } catch (err) {
    console.warn("⚠️ [API Prices] Rate limit check failed, continuing:", err);
  }

  const priceMap = new Map<string, CommodityPriceRow>();

  // Tier 1: Try querying Supabase commodity_prices table first
  try {
    const clients = await getRouteSupabaseClients({ verify: "claims" });

    if (clients) {
      const { supabase } = clients;

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
    return jsonPrices(_cachedPrices.payload, 200, { "x-prices-cache-status": "stale-fallback" });
  }

  return jsonPrices(payload);
}
