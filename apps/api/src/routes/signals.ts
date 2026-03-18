import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getSupabaseAdmin } from "../clients/supabase";
import { planGuard } from "../middleware/plan-guard.middleware";
import { REDIS_CHANNELS } from "../workers/pubsub";
import { getRedis } from "../clients/redis";

const querySchema = z.object({
  severity: z.coerce.number().int().min(1).max(10).optional(),
  region: z.string().min(1).optional(),
  commodity: z.string().min(1).optional(),
  cursor: z.string().min(1).optional(),
  sort: z.enum(["severity", "newest"]).default("severity"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function signalsRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid query", issues: parsed.error.issues });
    }

    const { severity, region, commodity, sort, page, limit, cursor } = parsed.data;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = getSupabaseAdmin();
    const planTier = req.user?.planTier ?? "free";
    const maxLimit = planTier === "api" ? 100 : 20;
    const clampedLimit = Math.min(limit, maxLimit);

    let query = supabase.from("signals").select("*", { count: "exact" }).eq("is_active", true);

    if (severity) query = query.gte("severity", severity);
    if (region) query = query.eq("region", region);
    if (commodity) query = query.contains("commodity_impacts", [{ asset: commodity }]);

    // Cursor-based pagination (by created_at). If cursor is present, ignore offset.
    if (cursor) {
      // We assume cursor is an ISO timestamp string.
      query = query.gt("created_at", cursor);
    }

    query =
      sort === "newest"
        ? query.order("created_at", { ascending: false })
        : query.order("severity", { ascending: false }).order("created_at", { ascending: false });

    const { data, error, count } = cursor
      ? await query.limit(clampedLimit)
      : await query.range(from, to);
    if (error) return reply.status(500).send({ error: "Query failed" });

    const nextCursor =
      Array.isArray(data) && data.length
        ? // Use the last row's created_at as the next cursor
          (data[data.length - 1] as { created_at?: string }).created_at ?? null
        : null;

    return reply.send({
      data: data ?? [],
      meta: { total: count ?? (data?.length ?? 0), page, limit: clampedLimit, nextCursor },
    });
  });

  app.get("/latest", async (_req, reply) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("signals")
      .select("id,title,summary,severity,confidence,created_at,is_breaking,sources_count,commodity_impacts,region,country,event_type")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) return reply.status(500).send({ error: "Query failed" });
    return reply.send({ data: data ?? [] });
  });

  // SSE stream for new signals (API tier + Pro can use it; free/analyst rely on polling)
  app.get(
    "/stream",
    { preHandler: planGuard(["pro", "api"]) },
    async (req, reply) => {
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      const pub = getRedis();
      const sub = pub.duplicate();
      await sub.connect();
      await sub.subscribe(REDIS_CHANNELS.newSignal);

      // Optional DB polling cursor-based fallback.
      // Clients can pass `lastSeen` (ISO timestamp). If omitted, we start 60s behind.
      const url = new URL(req.url, "http://localhost");
      const lastSeenRaw = url.searchParams.get("lastSeen");
      const lastSeen = lastSeenRaw ? new Date(lastSeenRaw) : new Date(Date.now() - 60_000);
      let cursor = lastSeen.toISOString();

      const heartbeat = setInterval(() => {
        reply.raw.write(`: ping\n\n`);
      }, 30_000);

      const poll = setInterval(async () => {
        try {
          const supabase = getSupabaseAdmin();
          const { data } = await supabase
            .from("signals")
            .select("*")
            .gt("created_at", cursor)
            .order("created_at", { ascending: true })
            .limit(20);

          if (data?.length) {
            for (const row of data) {
              cursor = row.created_at;
              reply.raw.write(`data: ${JSON.stringify(row)}\n\n`);
            }
          }
        } catch {
          // ignore and keep stream alive
        }
      }, 15_000);

      const onMessage = async (_channel: string, message: string) => {
        try {
          const payload = JSON.parse(message) as { signalId: string };
          const supabase = getSupabaseAdmin();
          const { data } = await supabase.from("signals").select("*").eq("id", payload.signalId).maybeSingle();
          if (!data) return;
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          // ignore malformed messages
        }
      };

      sub.on("message", onMessage);

      req.raw.on("close", async () => {
        clearInterval(heartbeat);
        clearInterval(poll);
        sub.off("message", onMessage);
        try {
          await sub.unsubscribe(REDIS_CHANNELS.newSignal);
          await sub.quit();
        } catch {
          // ignore
        }
      });

      return reply;
    },
  );
}

