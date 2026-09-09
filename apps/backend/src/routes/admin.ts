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

  // GET /v1/admin/service-health — #42 Phase 1 backing data for /admin/service-status.
  //   ?service=<name>  -> most recent 50 rows for that one service (the "Load data" click)
  //   (no param)       -> one summary row per distinct service (last status + 24h count)
  // Reads via the service-role client (service_health_events is RLS-on / no-policy),
  // so this works regardless of whether SUPABASE_SERVICE_ROLE_KEY is set on Vercel.
  app.get("/service-health", async (req, reply) => {
    const email = await assertAdmin(req, reply);
    if (!email) return;

    const supabase = getSupabaseAdmin();
    const service = (req.query as { service?: string })?.service?.trim();

    if (service) {
      const { data, error } = await supabase
        .from("service_health_events")
        .select("service, status, detail, latency_ms, created_at")
        .eq("service", service)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        req.log.error({ err: error }, "service_health_events query failed");
        return reply.status(500).send({ error: "Query failed" });
      }
      return reply.send({ data: { service, events: data ?? [] } });
    }

    // Summary: last 1000 rows is plenty to derive per-service latest status + a
    // rough recent-volume count without a SQL function.
    const { data, error } = await supabase
      .from("service_health_events")
      .select("service, status, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      req.log.error({ err: error }, "service_health_events summary query failed");
      return reply.status(500).send({ error: "Query failed" });
    }

    const dayAgo = Date.now() - 24 * 3_600_000;
    const byService = new Map<
      string,
      { service: string; last_status: string; last_at: string; last_detail: string | null; count_24h: number }
    >();
    for (const row of data ?? []) {
      const existing = byService.get(row.service);
      const inWindow = new Date(row.created_at).getTime() >= dayAgo;
      if (!existing) {
        byService.set(row.service, {
          service: row.service,
          last_status: row.status,
          last_at: row.created_at,
          last_detail: row.detail ?? null,
          count_24h: inWindow ? 1 : 0,
        });
      } else if (inWindow) {
        existing.count_24h += 1;
      }
    }

    return reply.send({
      data: { services: [...byService.values()].sort((a, b) => a.service.localeCompare(b.service)) },
    });
  });
}
