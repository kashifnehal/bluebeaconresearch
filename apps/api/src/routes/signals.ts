import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getSupabaseAdmin } from "../clients/supabase";

const querySchema = z.object({
  severity: z.coerce.number().int().min(1).max(10).optional(),
  region: z.string().min(1).optional(),
  commodity: z.string().min(1).optional(),
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

    const { severity, region, commodity, sort, page, limit } = parsed.data;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const supabase = getSupabaseAdmin();
    let query = supabase.from("signals").select("*", { count: "exact" }).eq("is_active", true);

    if (severity) query = query.gte("severity", severity);
    if (region) query = query.eq("region", region);
    if (commodity) query = query.contains("commodity_impacts", [{ asset: commodity }]);

    query =
      sort === "newest"
        ? query.order("created_at", { ascending: false })
        : query.order("severity", { ascending: false }).order("created_at", { ascending: false });

    const { data, error, count } = await query.range(from, to);
    if (error) return reply.status(500).send({ error: "Query failed" });

    return reply.send({
      data: data ?? [],
      meta: { total: count ?? (data?.length ?? 0), page, limit },
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
}

