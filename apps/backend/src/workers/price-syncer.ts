import YahooFinance from "yahoo-finance2";
import { PRICED_COMMODITIES } from "../lib/commodity-registry.js";
import { getRedis, recordRedisError } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { recordServiceHealth } from "../lib/service-health.js";

// BE-DB-RES1 Part 5 — a price outbox. A failed commodity_prices insert used to
// just drop that run's quotes; now the batch is queued in Redis and replayed on
// a later successful run, so a brief Supabase blip doesn't silently lose prices.
type PriceSyncRedis = {
  set(key: string, value: string, exFlag: "EX", seconds: number): Promise<"OK" | null>;
  rpush(key: string, value: string): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
  lpop(key: string, count: number): Promise<string[] | null>;
  ltrim(key: string, start: number, stop: number): Promise<"OK">;
  expire(key: string, seconds: number): Promise<number>;
};

type PriceSyncSupabase = { from: (table: string) => any };

export interface PriceSyncDeps {
  supabase?: PriceSyncSupabase;
  redis?: PriceSyncRedis | null;
  fetchQuote?: (yahooSymbol: string) => Promise<any>;
}

type PriceRecord = {
  symbol: string;
  price: number;
  change_24h: number;
  change_pct_24h: number;
  high_24h: number;
  low_24h: number;
  fetched_at: string;
};

const PENDING_KEY = "prices:pending";
const PENDING_CAP = 500;
const PENDING_TTL_SECONDS = 7 * 24 * 3600;
const MAX_DRAIN_BATCHES_PER_RUN = 20;

async function queueFailedBatch(redis: PriceSyncRedis | null | undefined, batch: PriceRecord[]): Promise<void> {
  if (!redis) return;
  try {
    await redis.rpush(PENDING_KEY, JSON.stringify(batch));
    await redis.ltrim(PENDING_KEY, -PENDING_CAP, -1);
    await redis.expire(PENDING_KEY, PENDING_TTL_SECONDS);
  } catch (err: any) {
    console.warn(`[PRICE SYNC] failed to queue batch to ${PENDING_KEY}: ${err?.message ?? err}`);
  }
}

/** LPOPs up to MAX_DRAIN_BATCHES_PER_RUN batches, replaying each via the same
 * insert call. On a failed replay, the batch is pushed back to the front of the
 * queue (so it's retried first next time) and the drain stops immediately. */
async function drainPendingBatches(
  supabase: PriceSyncSupabase,
  redis: PriceSyncRedis | null | undefined,
): Promise<{ replayed: number; requeued: number }> {
  if (!redis) return { replayed: 0, requeued: 0 };

  let replayed = 0;
  let requeued = 0;
  for (let i = 0; i < MAX_DRAIN_BATCHES_PER_RUN; i++) {
    let popped: string[] | null;
    try {
      popped = await redis.lpop(PENDING_KEY, 1);
    } catch (err: any) {
      console.warn(`[PRICE SYNC] failed to read ${PENDING_KEY}: ${err?.message ?? err}`);
      break;
    }
    if (!popped || popped.length === 0) break;

    const raw = popped[0]!;
    let batch: PriceRecord[];
    try {
      batch = JSON.parse(raw);
    } catch {
      continue; // drop an unparsable entry rather than loop on it forever
    }

    const { error } = await supabase.from("commodity_prices").insert(batch);
    if (error) {
      try {
        await redis.lpush(PENDING_KEY, raw);
      } catch (err: any) {
        console.warn(`[PRICE SYNC] failed to requeue batch to ${PENDING_KEY}: ${err?.message ?? err}`);
      }
      requeued += 1;
      break;
    }
    replayed += 1;
  }
  return { replayed, requeued };
}

// Priced entries only (provider "yahoo"). News-only tags have no ticker, so
// this map stays the 11 commodity symbols synced with the 7 forex pairs.
export const COMMODITY_SYMBOLS: Record<string, string> = Object.fromEntries(
  PRICED_COMMODITIES.map((c) => [c.symbol, c.yahooTicker]),
);

// Forex pairs (#87). Yahoo Finance forex ticker format is "<PAIR>=X". All six
// verified against a real yf.quote() call on 2026-09-09 — USDRUB=X and USDCNY=X
// (the less-common pairs) both returned live regularMarketPrice values.
// Written into the same commodity_prices table as COMMODITY_SYMBOLS (the table is
// a generic symbol/price time-series despite the name).
export const FOREX_SYMBOLS = {
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  USDCHF: "USDCHF=X",
  USDRUB: "USDRUB=X",
  USDCNY: "USDCNY=X",
  // USDINR added W7-ASSET-LISTS (2026-10-05, founder decision D2a). Verified
  // against a real yf.quote() call before writing this: USDINR=X returned
  // regularMarketPrice 96.2925, currency "INR", marketState "REGULAR".
  USDINR: "USDINR=X",
} as const;

export async function runPriceSyncOnce(deps: PriceSyncDeps = {}) {
  const supabase = deps.supabase ?? (getSupabaseAdmin() as unknown as PriceSyncSupabase);
  const redis = deps.redis !== undefined ? deps.redis : (getRedis() as unknown as PriceSyncRedis | null);
  const yf = new YahooFinance();
  const fetchQuote = deps.fetchQuote ?? ((sym: string) => yf.quote(sym));

  const results: PriceRecord[] = [];

  const allSymbols: Record<string, string> = {
    ...COMMODITY_SYMBOLS,
    ...FOREX_SYMBOLS,
  };
  const totalSymbols = Object.keys(allSymbols).length;
  let symbolFailures = 0;
  const syncStartedAt = Date.now();

  for (const [symbol, yahooSymbol] of Object.entries(allSymbols)) {
    try {
      const quote: any = await fetchQuote(yahooSymbol);
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
      await queueFailedBatch(redis, results);
    } else {
      console.log(`[PRICE SYNC] Updated ${results.length} commodity prices via Yahoo Finance`);
      const drainResult = await drainPendingBatches(supabase, redis);
      console.log(
        `[PRICE SYNC] outbox drain: replayed ${drainResult.replayed}, requeued ${drainResult.requeued}`,
      );
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
