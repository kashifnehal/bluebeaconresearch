import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { requireUser } from "../middleware/auth.middleware.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { getEnv } from "../env.js";

// Founder-internal admin routes. profiles has no `role` column (checked
// 2026-09-04 — it has plan_tier only), so admin identity is an email allowlist in
// the ADMIN_EMAILS env var (comma-separated). Unset => nobody is admin.
function adminEmailSet(): Set<string> {
  const raw = getEnv().ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Returns the admin's email on success; sends a 403 and returns null otherwise. */
async function assertAdmin(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const user = requireUser(req, reply);

  const allow = adminEmailSet();
  if (allow.size === 0) {
    reply.status(403).send({ error: "Forbidden" });
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data: authUser, error } = await supabase.auth.admin.getUserById(user.id);
  const email = authUser?.user?.email?.toLowerCase();
  if (error || !email || !allow.has(email)) {
    reply.status(403).send({ error: "Forbidden" });
    return null;
  }
  return email;
}

export async function adminRoutes(app: FastifyInstance) {
  // GET /v1/admin/metrics — usage snapshot for the founder-only /admin/metrics page.
  // Aggregation lives in public.admin_usage_metrics()
  // (supabase/migrations/20260904000002_admin_usage_metrics_fn.sql).
  app.get("/metrics", async (req, reply) => {
    const email = await assertAdmin(req, reply);
    if (!email) return;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("admin_usage_metrics");
    if (error) {
      req.log.error({ err: error }, "admin_usage_metrics rpc failed");
      return reply.status(500).send({ error: "Query failed" });
    }

    return reply.send({ data });
  });
}
