import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireUser } from "../middleware/auth.middleware.js";
import { getSupabaseAdmin } from "../clients/supabase.js";

const ruleSchema = z.object({
  name: z.string().min(1).max(120),
  regions: z.array(z.string()).optional().default([]),
  commodities: z.array(z.string()).optional().default([]),
  minSeverity: z.number().int().min(1).max(10).optional().default(8),
  channels: z.array(z.string()).optional().default(["email"]),
  frequency: z.enum(["immediate", "hourly", "daily"]).optional().default("immediate"),
  isActive: z.boolean().optional().default(true),
});

export async function alertsRoutes(app: FastifyInstance) {
  app.get("/rules", async (req, reply) => {
    const user = requireUser(req, reply);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("alert_rules")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return reply.status(500).send({ error: "Query failed" });
    return reply.send({ data: data ?? [] });
  });

  app.post("/rules", async (req, reply) => {
    const user = requireUser(req, reply);
    const parsed = ruleSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", issues: parsed.error.issues });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("alert_rules")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        regions: parsed.data.regions,
        commodities: parsed.data.commodities,
        min_severity: parsed.data.minSeverity,
        channels: parsed.data.channels,
        frequency: parsed.data.frequency,
        is_active: parsed.data.isActive,
      })
      .select("*")
      .maybeSingle();
    if (error) return reply.status(500).send({ error: "Insert failed" });
    return reply.send({ data });
  });

  app.patch("/rules/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    const id = String((req.params as any)?.id ?? "");
    const parsed = ruleSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });

    const supabase = getSupabaseAdmin();
    const patch: any = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.regions !== undefined) patch.regions = parsed.data.regions;
    if (parsed.data.commodities !== undefined) patch.commodities = parsed.data.commodities;
    if (parsed.data.minSeverity !== undefined) patch.min_severity = parsed.data.minSeverity;
    if (parsed.data.channels !== undefined) patch.channels = parsed.data.channels;
    if (parsed.data.frequency !== undefined) patch.frequency = parsed.data.frequency;
    if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("alert_rules")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) return reply.status(500).send({ error: "Update failed" });
    return reply.send({ data });
  });

  app.delete("/rules/:id", async (req, reply) => {
    const user = requireUser(req, reply);
    const id = String((req.params as any)?.id ?? "");
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("alert_rules").delete().eq("id", id).eq("user_id", user.id);
    if (error) return reply.status(500).send({ error: "Delete failed" });
    return reply.send({ ok: true });
  });

  app.get("/history", async (req, reply) => {
    const user = requireUser(req, reply);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("alerts_sent")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return reply.status(500).send({ error: "Query failed" });
    return reply.send({ data: data ?? [] });
  });
}

