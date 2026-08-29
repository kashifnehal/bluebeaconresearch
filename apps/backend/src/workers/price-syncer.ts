import YahooFinance from "yahoo-finance2";
import { getRedis, recordRedisError } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";

const COMMODITY_SYMBOLS = {
  USOIL: "CL=F",   // WTI Crude Oil futures
  UKOIL: "BZ=F",   // Brent Crude Oil futures
  XAUUSD: "GC=F",  // Gold futures
  NGAS: "NG=F",    // Natural Gas futures
  WHEAT: "ZW=F",   // Wheat futures (CBOT)
  COPPER: "HG=F",  // Copper futures
  XAGUSD: "SI=F",  // Silver futures
  CORN: "ZC=F",    // Corn futures
} as const;

export async function runPriceSyncOnce() {
  const supabase = getSupabaseAdmin();
  const redis = getRedis();
  const yf = new YahooFinance();

  const results: Array<{
    symbol: string;
    price: number;
    change_24h: number;
    change_pct_24h: number;
    high_24h: number;
    low_24h: number;
    fetched_at: string;
  }> = [];

  for (const [symbol, yahooSymbol] of Object.entries(COMMODITY_SYMBOLS)) {
    try {
      const quote: any = await yf.quote(yahooSymbol);
      if (quote && typeof quote.regularMarketPrice === "number") {
        const price = quote.regularMarketPrice;
        const change_24h = quote.regularMarketChange ?? 0;
        const change_pct_24h = quote.regularMarketChangePercent ?? 0;
        const high_24h = quote.regularMarketDayHigh ?? price;
        const low_24h = quote.regularMarketDayLow ?? price;
        const fetched_at = new Date().toISOString();

        const record = {
          symbol,
          price,
          change_24h,
          change_pct_24h,
          high_24h,
          low_24h,
          fetched_at,
        };

        results.push(record);

        // Cache in Redis with 15-minute TTL (900s)
        if (redis) {
          try {
            await redis.set(`prices:${symbol}`, JSON.stringify(record), "EX", 900);
          } catch (e: any) {
            recordRedisError(e?.message);
            console.warn(`[PRICE SYNC] Redis cache warning for ${symbol}:`, e.message);
          }
        }
      }
    } catch (err: any) {
      console.error(`[PRICE SYNC] Failed for ${symbol}:`, err?.message ?? err);
    }
  }

  if (results.length > 0) {
    const { error } = await supabase.from("commodity_prices").insert(results);
    if (error) {
      console.error("[PRICE SYNC] Supabase insert error:", error.message);
    } else {
      console.log(`[PRICE SYNC] Updated ${results.length} commodity prices via Yahoo Finance`);
    }
  }

  return { ok: results.length > 0, updated: results.length };
}
