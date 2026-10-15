import { getSupabaseAdmin } from "../clients/supabase.js";

/**
 * #42 Service Health Dashboard, Phase 1.
 *
 * A thin, best-effort insert into public.service_health_events. Called from each
 * collector / price-sync call site on success and on failure so the founder-only
 * /admin/service-status page has a per-service history to show.
 *
 * MUST NEVER THROW OR BLOCK THE CALLER. The insert is wrapped in its own try/catch
 * and log-and-swallows on any failure — this is an observability side-channel, not
 * something that should ever become a new source of collector outages.
 */
// "rejected" added for #139/#141's materiality gate (service: "materiality_gate")
// — reusing this existing append-only health log for the reject audit trail
// instead of inventing a new table, per the task's explicit instruction to check
// here first.
export type ServiceHealthStatus = "ok" | "error" | "rate_limited" | "rejected" | "degraded";

type HealthInsertClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: HealthInsertError | null }>;
  };
};

export type RecordServiceHealthOptions = {
  supabase?: HealthInsertClient;
  rawEventId?: string;
};

type HealthInsertError = { message: string; code?: string };

let loggedMissingRawEventId = false;

function missingRawEventIdColumn(error: HealthInsertError): boolean {
  const message = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return (
    message.includes("raw_event_id") &&
    (message.includes("column") || message.includes("schema cache") || message.includes("pgrst204"))
  );
}

function healthRow(
  service: string,
  status: ServiceHealthStatus,
  detail: string | undefined,
  latencyMs: number | undefined,
  rawEventId: string | undefined,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    service,
    status,
    detail: detail ? detail.slice(0, 2000) : null,
    latency_ms:
      typeof latencyMs === "number" && Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
  };
  if (rawEventId) row.raw_event_id = rawEventId;
  return row;
}

export async function recordServiceHealth(
  service: string,
  status: ServiceHealthStatus,
  detail?: string,
  latencyMs?: number,
  options?: RecordServiceHealthOptions,
): Promise<void> {
  try {
    const supabase = (options?.supabase ?? getSupabaseAdmin()) as HealthInsertClient;
    const insert = (row: Record<string, unknown>) => supabase.from("service_health_events").insert(row);
    const payload = healthRow(service, status, detail, latencyMs, options?.rawEventId);
    const { error } = await insert(payload);
    if (!error) return;
    if (payload.raw_event_id && missingRawEventIdColumn(error)) {
      if (!loggedMissingRawEventId) {
        loggedMissingRawEventId = true;
        console.warn(
          `[service-health] raw_event_id column is missing; retrying without it: ${error.message}`,
        );
      }
      const { raw_event_id: _omit, ...withoutColumn } = payload;
      const retry = await insert(withoutColumn);
      if (retry.error) {
        console.warn(
          `[service-health] insert failed for ${service}/${status}:`,
          retry.error.message,
        );
      }
      return;
    }
    console.warn(`[service-health] insert failed for ${service}/${status}:`, error.message);
  } catch (e) {
    console.warn(
      `[service-health] insert threw for ${service}/${status}:`,
      e instanceof Error ? e.message : e,
    );
  }
}
