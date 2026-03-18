import axios from "axios";

import { getEnv } from "../env";
import { getRedis } from "../clients/redis";
import { getSupabaseAdmin } from "../clients/supabase";

const SYMBOLS = ["USOIL", "UKOIL", "XAUUSD", "WHEAT", "NGAS", "CORN", "EURUSD", "USDRUB"] as const;

function parseNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function runPriceSyncOnce() {
  const env = getEnv();
  if (!env.ALPHA_VANTAGE_API_KEY) return { ok: false, reason: "Missing ALPHA_VANTAGE_API_KEY" as const };

  const supabase = getSupabaseAdmin();
  const redis = getRedis();

  let inserted = 0;

  for (const symbol of SYMBOLS) {
    const url = "https://www.alphavantage.co/query";
    const res = await axios.get(url, {
      timeout: 20_000,
      params: { function: "GLOBAL_QUOTE", symbol, apikey: env.ALPHA_VANTAGE_API_KEY },
    });

    const quote = res.data?.["Global Quote"] ?? {};
    const price = parseNumber(quote["05. price"]);
    const change = parseNumber(quote["09. change"]);
    const changePct = typeof quote["10. change percent"] === "string" ? Number(quote["10. change percent"].replace("%", "")) : null;
    const high = parseNumber(quote["03. high"]);
    const low = parseNumber(quote["04. low"]);

    const fetchedAt = new Date().toISOString();
    const { error } = await supabase.from("commodity_prices").insert({
      symbol,
      price,
      change_24h: change,
      change_pct_24h: changePct,
      high_24h: high,
      low_24h: low,
      fetched_at: fetchedAt,
    });
    if (!error) inserted += 1;

    await redis.set(`prices:${symbol}`, JSON.stringify({ symbol, price, changePct24h: changePct, fetchedAt }), "EX", 900);
  }

  return { ok: true as const, inserted };
}

