import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";

import { requireUser } from "../middleware/auth.middleware";
import { planGuard } from "../middleware/plan-guard.middleware";
import { getSupabaseAdmin } from "../clients/supabase";

const createSchema = z.object({
  name: z.string().min(1).max(80),
});

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomKey() {
  return crypto.randomBytes(32).toString("hex"); // 64 chars
}

export async function apiKeysRoutes(app: FastifyInstance) {
  // API plan only
  app.get("/", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("api_keys")
      .select("id,name,key_prefix,last_used_at,call_count,is_active,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return reply.status(500).send({ error: "Query failed" });
    return reply.send({ data: data ?? [] });
  });

  app.post("/", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid body", issues: parsed.error.issues });

    const supabase = getSupabaseAdmin();
    const { count } = await supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((count ?? 0) >= 5) return reply.status(400).send({ error: "Max 5 keys per account" });

    const secret = randomKey();
    const key = `cis_live_${secret}`;
    const keyPrefix = key.slice(0, 12);
    const keyHash = sha256Hex(key);

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        is_active: true,
      })
      .select("id,name,key_prefix,created_at")
      .maybeSingle();
    if (error || !data) return reply.status(500).send({ error: "Failed to create key" });

    // IMPORTANT: return full key once, client must store it.
    return reply.send({ data, fullKey: key });
  });

  app.patch("/:id", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const id = String((req.params as any)?.id ?? "");
    const body = z.object({ isActive: z.boolean().optional(), name: z.string().min(1).max(80).optional() }).safeParse(req.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid body" });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("api_keys")
      .update({
        ...(body.data.isActive === undefined ? {} : { is_active: body.data.isActive }),
        ...(body.data.name ? { name: body.data.name } : {}),
      })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return reply.status(500).send({ error: "Update failed" });
    return reply.send({ ok: true });
  });

  app.delete("/:id", { preHandler: planGuard(["api"]) }, async (req, reply) => {
    const user = requireUser(req, reply);
    const id = String((req.params as any)?.id ?? "");
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("api_keys").delete().eq("id", id).eq("user_id", user.id);
    if (error) return reply.status(500).send({ error: "Delete failed" });
    return reply.send({ ok: true });
  });
}

