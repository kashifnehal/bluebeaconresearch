import type { FastifyInstance } from "fastify";
import { z } from "zod";
import axios from "axios";

import { requireUser } from "../middleware/auth.middleware.js";
import { planGuard } from "../middleware/plan-guard.middleware.js";
import { getSupabaseAdmin } from "../clients/supabase.js";

const endpointSchema = z.object({
  url: z.string().url(),
  name: z.string().max(120).optional(),
  filters: z
    .object({
      minSeverity: z.number().int().min(1).max(10).optional(),
      regions: z.array(z.string()).optional(),
      commodities: z.array(z.string()).optional(),
    })
    .optional()
    .default({}),
  isActive: z.boolean().optional().default(true),
});

export async function webhooksRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return reply.status(500).send({ error: "Query failed" });
    return reply.send({ data: data ?? [] });
  });

  app.post("/", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const parsed = endpointSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", issues: parsed.error.issues });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .insert({
        user_id: user.id,
        url: parsed.data.url,
        name: parsed.data.name ?? null,
        filters: parsed.data.filters,
        is_active: parsed.data.isActive,
      })
      .select("*")
      .maybeSingle();
    if (error) return reply.status(500).send({ error: "Insert failed" });
    return reply.send({ data });
  });

  app.patch("/:id", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const id = String((req.params as any)?.id ?? "");
    const parsed = endpointSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body" });

    const supabase = getSupabaseAdmin();
    const patch: any = {};
    if (parsed.data.url !== undefined) patch.url = parsed.data.url;
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.filters !== undefined) patch.filters = parsed.data.filters;
    if (parsed.data.isActive !== undefined) patch.is_active = parsed.data.isActive;
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) return reply.status(500).send({ error: "Update failed" });
    return reply.send({ data });
  });

  app.delete("/:id", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const id = String((req.params as any)?.id ?? "");
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("webhook_endpoints").delete().eq("id", id).eq("user_id", user.id);
    if (error) return reply.status(500).send({ error: "Delete failed" });
    return reply.send({ ok: true });
  });

  app.post("/:id/test", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const id = String((req.params as any)?.id ?? "");
    const supabase = getSupabaseAdmin();
    const { data: endpoint } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!endpoint?.url) return reply.status(404).send({ error: "Not found" });

    const { data: latest } = await supabase
      .from("signals")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const payload = latest ?? { sample: true };

    const started = Date.now();
    try {
      const resp = await axios.post(endpoint.url, payload, { timeout: 10_000 });
      await supabase.from("webhook_deliveries").insert({
        endpoint_id: endpoint.id,
        signal_id: latest?.id ?? undefined,
        payload,
        status_code: resp.status,
        response_body: typeof resp.data === "string" ? resp.data.slice(0, 2000) : JSON.stringify(resp.data).slice(0, 2000),
        attempt_count: 1,
        delivered_at: new Date().toISOString(),
      } as any);
      return reply.send({ ok: true, status: resp.status, ms: Date.now() - started });
    } catch (e) {
      await supabase.from("webhook_deliveries").insert({
        endpoint_id: endpoint.id,
        signal_id: latest?.id ?? undefined,
        payload,
        status_code: 0,
        response_body: e instanceof Error ? e.message : "failed",
        attempt_count: 1,
      } as any);
      return reply.status(400).send({ ok: false, error: e instanceof Error ? e.message : "failed", ms: Date.now() - started });
    }
  });

  app.get("/deliveries", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const supabase = getSupabaseAdmin();

    const { data: endpoints } = await supabase
      .from("webhook_endpoints")
      .select("id")
      .eq("user_id", user.id);
    const ids = (endpoints ?? []).map((e) => e.id);
    if (!ids.length) return reply.send({ data: [] });

    const { data, error } = await supabase
      .from("webhook_deliveries")
      .select("*")
      .in("endpoint_id", ids)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return reply.status(500).send({ error: "Query failed" });
    return reply.send({ data: data ?? [] });
  });
}

