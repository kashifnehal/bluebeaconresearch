import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";

import { getSupabaseAdmin } from "../clients/supabase";

export type AuthedUser = {
  id: string;
  planTier: "free" | "analyst" | "pro" | "api";
};

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}

const apiKeySchema = z.string().min(10);

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function registerAuth(app: FastifyInstance) {
  app.addHook("preHandler", async (req, reply) => {
    // Allow health/docs without auth
    if (req.url.startsWith("/health") || req.url.startsWith("/docs")) return;

    const supabase = getSupabaseAdmin();

    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers["x-api-key"];

    // 1) Bearer JWT (Supabase access token)
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user?.id) return reply.status(401).send({ error: "Unauthorized" });

      const { data: profile } = await supabase
        .from("profiles")
        .select("plan_tier")
        .eq("id", data.user.id)
        .maybeSingle();

      req.user = {
        id: data.user.id,
        planTier: (profile?.plan_tier ?? "free") as AuthedUser["planTier"],
      };
      return;
    }

    // 2) API key
    if (typeof apiKeyHeader === "string") {
      const parsed = apiKeySchema.safeParse(apiKeyHeader);
      if (!parsed.success) return reply.status(401).send({ error: "Unauthorized" });

      const keyHash = sha256Hex(parsed.data);
      const { data: keyRow } = await supabase
        .from("api_keys")
        .select("id,user_id,is_active")
        .eq("key_hash", keyHash)
        .maybeSingle();

      if (!keyRow?.id || keyRow.is_active === false) return reply.status(401).send({ error: "Unauthorized" });

      await supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRow.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("plan_tier")
        .eq("id", keyRow.user_id)
        .maybeSingle();

      req.user = {
        id: keyRow.user_id,
        planTier: (profile?.plan_tier ?? "free") as AuthedUser["planTier"],
      };
      return;
    }

    return reply.status(401).send({ error: "Unauthorized" });
  });
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): AuthedUser {
  const u = req.user;
  if (!u) {
    reply.status(401).send({ error: "Unauthorized" });
    // Fastify requires return type; throw to stop execution.
    throw new Error("Unauthorized");
  }
  return u;
}

