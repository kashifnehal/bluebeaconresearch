import type { FastifyInstance } from "fastify";

import { getSupabaseAdmin } from "../clients/supabase.js";

export async function eventsRoutes(app: FastifyInstance) {
  app.get("/:id", async (req, reply) => {
    const id = String((req.params as any)?.id ?? "");
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("signals").select("*").eq("id", id).maybeSingle();
    if (error) return reply.status(500).send({ error: "Query failed" });
    if (!data) return reply.status(404).send({ error: "Not found" });
    return reply.send({ data });
  });
}

