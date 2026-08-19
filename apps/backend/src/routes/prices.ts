import type { FastifyInstance } from "fastify";

import { getRedis, recordRedisError } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";

const SYMBOLS = ["USOIL", "UKOIL", "XAUUSD", "WHEAT", "NGAS", "CORN", "EURUSD", "USDRUB"] as const;

export async function pricesRoutes(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    const redis = getRedis();
    // A Redis failure here (e.g. quota exhaustion) used to throw uncaught out of the
    // handler, 500ing every request instead of reaching the DB fallback right below —
    // this scales with request volume, unlike the mostly-cron-driven Redis call sites.
    let parsed: unknown[] = [];
    if (redis) {
      try {
        const cached = await Promise.all(SYMBOLS.map((s) => redis.get(`prices:${s}`)));
        parsed = cached
          .map((v) => {
            if (!v) return null;
            try {
              return JSON.parse(v);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      } catch (err) {
        recordRedisError(err instanceof Error ? err.message : String(err));
        app.log.warn({ err }, "[prices] Redis read failed, falling back to DB snapshot");
      }
    }

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
    let v: string | null = null;
    if (redis) {
      try {
        v = await redis.get(`prices:${symbol}`);
      } catch (err) {
        recordRedisError(err instanceof Error ? err.message : String(err));
        app.log.warn({ err }, "[prices] Redis read failed, falling back to DB snapshot");
      }
    }
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

