import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { requireUser } from "../middleware/auth.middleware.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { getRedis } from "../clients/redis.js";
import { getEnv } from "../env.js";
import { DB_PROBE_HISTORY_KEY } from "../lib/db-unreachable-alert.js";

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

// #276 — the summary branch below used to stop at a single 1000-row fetch,
// which could undercount count_24h once total event volume across all
// services passed that cap. Page through with .range() instead (same proven
// pattern as accuracy.routes.ts's fetchAllOutcomes). MAX_SUMMARY_PAGES is a
// safety margin on the loop, an operational choice, not a sourced threshold.
const SERVICE_HEALTH_SUMMARY_PAGE_SIZE = 1000;
const MAX_SUMMARY_PAGES = 50;

type ServiceHealthEventRow = {
  service: string;
  status: string;
  detail: string | null;
  created_at: string;
};

async function fetchAllServiceHealthEvents(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<ServiceHealthEventRow[]> {
  const rows: ServiceHealthEventRow[] = [];
  for (let pageIdx = 0; pageIdx < MAX_SUMMARY_PAGES; pageIdx++) {
    const from = pageIdx * SERVICE_HEALTH_SUMMARY_PAGE_SIZE;
    const { data, error } = await supabase
      .from("service_health_events")
      .select("service, status, detail, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + SERVICE_HEALTH_SUMMARY_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as ServiceHealthEventRow[]));
    if (data.length < SERVICE_HEALTH_SUMMARY_PAGE_SIZE) break;
  }
  return rows;
}

// GET /v1/admin/db-probe-history backing data (BE-DB-RES1). Entries come from
// db-unreachable-alert.ts's Redis LPUSH (newest first — LPUSH writes to the head,
// so an LRANGE 0..N-1 read is already newest-first with no re-sort needed).
const DB_PROBE_HISTORY_DEFAULT_LIMIT = 288;
const DB_PROBE_HISTORY_MAX_LIMIT = 2016;

export type DbProbeHistoryEntry = { at: string; ok: boolean; ms: number; error?: string };

export type DbProbeHistorySummary = {
  count: number;
  failures: number;
  p50_ms: number;
  p95_ms: number;
  longest_failure_streak: number;
};

/** Nearest-rank percentile (ceil(p/100 * N) - 1, clamped) over ms values. */
function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedMs.length);
  const idx = Math.min(sortedMs.length - 1, Math.max(0, rank - 1));
  return sortedMs[idx]!;
}

/** `entries` is newest-first, matching the Redis LPUSH/LRANGE order. */
export function summarizeDbProbeHistory(entries: DbProbeHistoryEntry[]): DbProbeHistorySummary {
  const count = entries.length;
  const failures = entries.filter((e) => !e.ok).length;
  const sortedMs = entries.map((e) => e.ms).sort((a, b) => a - b);

  let longestFailureStreak = 0;
  let current = 0;
  for (const entry of entries) {
    if (entry.ok) {
      current = 0;
    } else {
      current += 1;
      longestFailureStreak = Math.max(longestFailureStreak, current);
    }
  }

  return {
    count,
    failures,
    p50_ms: percentile(sortedMs, 50),
    p95_ms: percentile(sortedMs, 95),
    longest_failure_streak: longestFailureStreak,
  };
}

function parseDbProbeHistoryLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DB_PROBE_HISTORY_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), DB_PROBE_HISTORY_MAX_LIMIT);
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
  // (supabase/migrations/20260919160000_profiles_is_test_account.sql supersedes
  // 20260904000002/000003). Every count excludes profiles.is_test_account = true.
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

    // Summary: page through every row via .range() so count_24h isn't
    // undercounted once total event volume passes a single request's cap.
    let data: ServiceHealthEventRow[];
    try {
      data = await fetchAllServiceHealthEvents(supabase);
    } catch (err) {
      req.log.error({ err }, "service_health_events summary query failed");
      return reply.status(500).send({ error: "Query failed" });
    }

    const dayAgo = Date.now() - 24 * 3_600_000;
    const byService = new Map<
      string,
      { service: string; last_status: string; last_at: string; last_detail: string | null; count_24h: number }
    >();
    for (const row of data) {
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

  // GET /v1/admin/db-probe-history — BE-DB-RES1. Backing data for a future
  // db-health chart: raw probe history and a few derived stats, read from
  // Redis only (db-health:history, written by db-unreachable-alert.ts's
  // checkDatabaseReachable). No database query — this must keep working even
  // while the database itself is unreachable.
  app.get("/db-probe-history", async (req, reply) => {
    const email = await assertAdmin(req, reply);
    if (!email) return;

    const limit = parseDbProbeHistoryLimit((req.query as { limit?: string })?.limit);

    const redis = getRedis();
    if (!redis) {
      return reply.send({ data: { entries: [], summary: summarizeDbProbeHistory([]) } });
    }

    let raw: string[];
    try {
      raw = await redis.lrange(DB_PROBE_HISTORY_KEY, 0, limit - 1);
    } catch (err) {
      req.log.error({ err }, "db-health:history lrange failed");
      return reply.status(500).send({ error: "Query failed" });
    }

    const entries: DbProbeHistoryEntry[] = [];
    for (const item of raw) {
      try {
        entries.push(JSON.parse(item));
      } catch {
        // skip a corrupted history entry rather than fail the whole response
      }
    }

    return reply.send({ data: { entries, summary: summarizeDbProbeHistory(entries) } });
  });
}
