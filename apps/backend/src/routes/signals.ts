import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getSupabaseAdmin } from "../clients/supabase.js";
import { planGuard } from "../middleware/plan-guard.middleware.js";
import { REDIS_CHANNELS } from "../workers/pubsub.js";
import { getRedis } from "../clients/redis.js";
import { sortByRelevance } from "../lib/relevance-rank.js";

const querySchema = z.object({
  severity: z.coerce.number().int().min(1).max(10).optional(),
  region: z.string().min(1).optional(),
  commodity: z.string().min(1).optional(),
  window: z.enum(["latest", "24h", "7d", "30d", "active"]).optional(),
  cursor: z.string().min(1).optional(),
  // "relevance" = recency+severity blend, computed in application code — see
  // sortByRelevance()/relevanceRankScore() in ../lib/relevance-rank.js. Added
  // for command-palette-style search ranking; does not change the default
  // ("severity") used elsewhere.
  sort: z.enum(["severity", "newest", "relevance"]).default("severity"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Casing/hyphen variants so "Middle East" matches "middle-east" and vice versa. */
function expandRegionVariants(selected: string): string[] {
  const raw = selected.trim();
  const key = raw
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  if (!key) return [];
  const hyphen = key.replace(/ /g, "-");
  const titleSpace = key.replace(/\b\w/g, (c) => c.toUpperCase());
  const titleHyphen = hyphen
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join("-");
  return [...new Set([raw, key, hyphen, titleSpace, titleHyphen].filter(Boolean))];
}

export async function signalsRoutes(app: FastifyInstance) {
  app.get("/", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Invalid query", issues: parsed.error.issues });
    }

    const { severity, region, commodity, window, sort, page, limit, cursor } =
      parsed.data;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = getSupabaseAdmin();
    const planTier = req.user?.planTier ?? "free";
    const maxLimit = planTier === "api" ? 100 : 20;
    const clampedLimit = Math.min(limit, maxLimit);

    let query = supabase.from("signals").select("*", { count: "exact" });

    if (severity) query = query.gte("severity", severity);
    if (region) {
      const variants = expandRegionVariants(region);
      query =
        variants.length > 1
          ? query.in("region", variants)
          : query.eq("region", region);
    }
    if (commodity) {
      const symbols = commodity
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[A-Z0-9]+$/.test(s));
      if (symbols.length === 1) {
        query = query.contains("commodity_impacts", [{ asset: symbols[0] }]);
      } else if (symbols.length > 1) {
        const parts = symbols.map(
          (sym) => `commodity_impacts.cs.[{"asset":"${sym}"}]`,
        );
        query = query.or(parts.join(","));
      }
    }

    const twentyFourHoursAgo = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    if (window === "active") {
      query = query.eq("is_active", true);
    } else if (window === "7d") {
      query = query.gte("event_date", sevenDaysAgo);
    } else if (window === "30d") {
      query = query.gte("event_date", thirtyDaysAgo);
    } else if (window === "24h") {
      query = query.gte("event_date", twentyFourHoursAgo);
    } else {
      query = query.or(
        `event_date.gte.${twentyFourHoursAgo},is_active.eq.true`,
      );
    }

    // Cursor-based pagination (by created_at). If cursor is present, ignore offset.
    if (cursor) {
      // We assume cursor is an ISO timestamp string.
      query = query.gt("created_at", cursor);
    }

    // sort=relevance blends recency+severity in application code (below),
    // not SQL — it needs a candidate set fetched up front and re-ranked/sliced
    // after the query returns, not the `.range()`-based DB paging the other
    // sort modes use.
    const isRelevanceSort = sort === "relevance";
    const RELEVANCE_CANDIDATE_LIMIT = 200;

    query =
      sort === "newest"
        ? query.order("created_at", { ascending: false })
        : isRelevanceSort
          ? // Pre-sort for the candidate fetch — most-recent/highest-severity
            // first is a reasonable set to draw the top RELEVANCE_CANDIDATE_LIMIT
            // rows from before the real recency+severity re-rank below.
            query
              .order("created_at", { ascending: false })
              .order("severity", { ascending: false })
          : query
              .order("severity", { ascending: false })
              .order("created_at", { ascending: false });

    const { data, error, count } = cursor
      ? await query.limit(clampedLimit)
      : isRelevanceSort
        ? await query.limit(Math.max(RELEVANCE_CANDIDATE_LIMIT, to + 1))
        : await query.range(from, to);
    if (error) return reply.status(500).send({ error: "Query failed" });

    // Re-rank the candidate set by recency+severity, then take this page's
    // slice out of that ranked order. `rank_score = severity / (hours_since + 2) ^ 1.8`
    // — see ../lib/relevance-rank.js. NOTE: nextCursor below is only
    // approximate for relevance mode (created_at of whatever row lands last
    // in the *sliced* ranked page, not the DB fetch order) — acceptable
    // today since sort=relevance has no page>1 caller yet.
    const rankedRows = isRelevanceSort
      ? sortByRelevance(
          (data ?? []) as { severity: number; created_at: string }[],
          (r) => r.severity,
          (r) => r.created_at,
        )
      : (data ?? []);
    const pagedRows = isRelevanceSort ? rankedRows.slice(from, to + 1) : rankedRows;

    const nextCursor =
      Array.isArray(pagedRows) && pagedRows.length
        ? // Use the last row's created_at as the next cursor
          ((pagedRows[pagedRows.length - 1] as { created_at?: string })
            .created_at ?? null)
        : null;

    return reply.send({
      data: pagedRows,
      meta: {
        total: count ?? pagedRows?.length ?? 0,
        page,
        limit: clampedLimit,
        nextCursor,
      },
    });
  });

  app.get("/latest", async (_req, reply) => {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("signals")
      .select(
        "id,title,summary,severity,confidence,created_at,is_breaking,sources_count,commodity_impacts,region,country,event_type,classification_method,media_impact_entity",
      )
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
      if (!pub) {
        return reply
          .status(503)
          .send({ error: "Redis required for SSE streams" });
      }
      const sub = pub.duplicate();
      await sub.connect();
      await sub.subscribe(REDIS_CHANNELS.newSignal);

      // Optional DB polling cursor-based fallback.
      // Clients can pass `lastSeen` (ISO timestamp). If omitted, we start 60s behind.
      const url = new URL(req.url, "http://localhost");
      const lastSeenRaw = url.searchParams.get("lastSeen");
      const lastSeen = lastSeenRaw
        ? new Date(lastSeenRaw)
        : new Date(Date.now() - 60_000);
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
          const { data } = await supabase
            .from("signals")
            .select("*")
            .eq("id", payload.signalId)
            .maybeSingle();
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
