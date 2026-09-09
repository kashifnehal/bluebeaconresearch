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
export type ServiceHealthStatus = "ok" | "error" | "rate_limited";

export async function recordServiceHealth(
  service: string,
  status: ServiceHealthStatus,
  detail?: string,
  latencyMs?: number,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("service_health_events").insert({
      service,
      status,
      detail: detail ? detail.slice(0, 2000) : null,
      latency_ms:
        typeof latencyMs === "number" && Number.isFinite(latencyMs)
          ? Math.round(latencyMs)
          : null,
    });
    if (error) {
      console.warn(
        `[service-health] insert failed for ${service}/${status}:`,
        error.message,
      );
    }
  } catch (e) {
    console.warn(
      `[service-health] insert threw for ${service}/${status}:`,
      e instanceof Error ? e.message : e,
    );
  }
}
