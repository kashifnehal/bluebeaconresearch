import type { FastifyInstance } from "fastify";

import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";

const SYMBOLS = ["USOIL", "UKOIL", "XAUUSD", "WHEAT", "NGAS", "CORN", "EURUSD", "USDRUB"] as const;

export async function pricesRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    const redis = getRedis();
    if (!redis) {
      return reply.status(503).send({ error: "Redis not available" });
    }
    const cached = await Promise.all(SYMBOLS.map((s) => redis.get(`prices:${s}`)));
    const parsed = cached
      .map((v) => {
        if (!v) return null;
        try {
          return JSON.parse(v);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (parsed.length) return reply.send({ data: parsed });

    // fallback to DB snapshot
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("commodity_prices")
      .select("symbol,price,change_pct_24h,fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(200);
    if (error) return reply.status(500).send({ error: "Query failed" });

    const latest = new Map<string, any>();
    for (const row of data ?? []) {
      if (!latest.has(row.symbol)) latest.set(row.symbol, row);
    }
    return reply.send({ data: Array.from(latest.values()) });
  });

  app.get("/:symbol", async (req, reply) => {
    const symbol = String((req.params as any)?.symbol ?? "").toUpperCase();
    const redis = getRedis();
    const v = redis ? await redis.get(`prices:${symbol}`) : null;
    if (v) {
      try {
        return reply.send({ data: JSON.parse(v) });
      } catch {
        // ignore
      }
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("commodity_prices")
      .select("*")
      .eq("symbol", symbol)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return reply.status(500).send({ error: "Query failed" });
    if (!data) return reply.status(404).send({ error: "Not found" });
    return reply.send({ data });
  });
}

