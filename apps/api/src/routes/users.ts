import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireUser } from "../middleware/auth.middleware";
import { getSupabaseAdmin } from "../clients/supabase";

const pushTokenSchema = z.object({
  expoPushToken: z.string().min(10),
});

export async function usersRoutes(app: FastifyInstance) {
  app.post("/push-token", async (req, reply) => {
    const user = requireUser(req, reply);

    const parsed = pushTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", issues: parsed.error.issues });
    }

    const supabase = getSupabaseAdmin();
    const token = parsed.data.expoPushToken;

    const { data: profile } = await supabase.from("profiles").select("push_tokens").eq("id", user.id).maybeSingle();
    const existing = (profile?.push_tokens ?? []) as string[];
    const next = existing.includes(token) ? existing : [...existing, token];

    const { error } = await supabase
      .from("profiles")
      .update({ push_tokens: next, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (error) return reply.status(500).send({ error: "Failed to save token" });
    return reply.send({ ok: true });
  });
}

