import YahooFinance from "yahoo-finance2";
import { getRedis, recordRedisError } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { recordServiceHealth } from "../lib/service-health.js";

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

// Forex pairs (#87). Yahoo Finance forex ticker format is "<PAIR>=X". All six
// verified against a real yf.quote() call on 2026-09-09 — USDRUB=X and USDCNY=X
// (the less-common pairs) both returned live regularMarketPrice values.
// Written into the same commodity_prices table as COMMODITY_SYMBOLS (the table is
// a generic symbol/price time-series despite the name).
const FOREX_SYMBOLS = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  USDCHF: "USDCHF=X",
  USDRUB: "USDRUB=X",
  USDCNY: "USDCNY=X",
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

  const allSymbols: Record<string, string> = {
    ...COMMODITY_SYMBOLS,
    ...FOREX_SYMBOLS,
  };
  const totalSymbols = Object.keys(allSymbols).length;
  let symbolFailures = 0;
  const syncStartedAt = Date.now();

  for (const [symbol, yahooSymbol] of Object.entries(allSymbols)) {
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
      symbolFailures += 1;
      console.error(`[PRICE SYNC] Failed for ${symbol}:`, err?.message ?? err);
    }
  }

  let insertError: string | undefined;
  if (results.length > 0) {
    const { error } = await supabase.from("commodity_prices").insert(results);
    if (error) {
      insertError = error.message;
      console.error("[PRICE SYNC] Supabase insert error:", error.message);
    } else {
      console.log(`[PRICE SYNC] Updated ${results.length} commodity prices via Yahoo Finance`);
    }
  }

  // #42 — one health row per run for the Yahoo Finance price-sync job.
  const latencyMs = Date.now() - syncStartedAt;
  if (results.length === 0) {
    await recordServiceHealth(
      "yahoo_finance",
      "error",
      `no quotes returned (${symbolFailures}/${totalSymbols} symbols failed)`,
      latencyMs,
    );
  } else if (insertError) {
    await recordServiceHealth("yahoo_finance", "error", `db insert failed: ${insertError}`, latencyMs);
  } else {
    await recordServiceHealth(
      "yahoo_finance",
      "ok",
      `updated ${results.length}/${totalSymbols} symbols` +
        (symbolFailures > 0 ? ` (${symbolFailures} symbol fetch failure(s))` : ""),
      latencyMs,
    );
  }

  return { ok: results.length > 0, updated: results.length };
}
