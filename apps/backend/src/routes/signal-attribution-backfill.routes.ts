import type { FastifyInstance } from "fastify";

import { requireUser } from "../middleware/auth.middleware.js";
import { runChartAttributionBackfill } from "../services/chart-attribution-backfill.service.js";

// Phase 2 of chart attribution (#207/#228). Called only by
// apps/web/app/api/signals/attribution/route.ts, only after its own DB-first
// lookup returns zero results. Auth-gated the same as every other /v1/signals
// route (registerAuth's global preHandler); rate limiting for this specific,
// classifier-triggering path lives on the caller side (apps/web's
// rateLimitOrPass, keyed per user) plus this service's own backend-wide
// @fastify/rate-limit (60/min, registered in app.ts).
export async function signalAttributionBackfillRoutes(app: FastifyInstance) {
  app.get("/attribution-backfill", async (req, reply) => {
    const user = requireUser(req, reply);

    const query = req.query as { asset?: string; timestamp?: string };
    const asset = query.asset?.trim();
    const timestampMs = query.timestamp ? new Date(query.timestamp).getTime() : NaN;

    if (!asset || !/^[A-Z0-9]+$/.test(asset)) {
      return reply.status(400).send({ error: "asset is required" });
    }
    if (!Number.isFinite(timestampMs)) {
      return reply.status(400).send({ error: "timestamp is required" });
    }

    try {
      const { results } = await runChartAttributionBackfill({ asset, timestampMs });
      return reply.send({ results });
    } catch (err) {
      req.log?.error?.({ err, userId: user.id }, "[attribution-backfill] unexpected error");
      return reply.status(500).send({ results: [] });
    }
  });
}
