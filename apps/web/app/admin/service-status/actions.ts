"use server";

import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";

export type ServiceHealthEvent = {
  service: string;
  status: string;
  detail: string | null;
  latency_ms: number | null;
  created_at: string;
};

export type LoadResult =
  | { ok: true; events: ServiceHealthEvent[] }
  | { ok: false; error: string };

/**
 * #42 Phase 1 — the "Load data" click handler for /admin/service-status.
 * Re-checks admin on every call (never trust the client), then proxies to the
 * backend `GET /v1/admin/service-health?service=` route with the caller's bearer
 * token. Nothing on the page fetches until a click invokes this.
 */
export async function loadServiceEvents(service: string): Promise<LoadResult> {
  if (!service || typeof service !== "string") {
    return { ok: false, error: "No service specified" };
  }

  const clients = await getRouteSupabaseClients();
  if (!clients?.user || !isAdminEmail(clients.user.email)) {
    return { ok: false, error: "Not authorized" };
  }

  const {
    data: { session },
  } = await clients.supabaseAuth.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "No session" };
  }

  const apiBase = process.env.API_URL;
  if (!apiBase) return { ok: false, error: "Missing API_URL env var" };

  try {
    const res = await fetch(
      `${apiBase}/v1/admin/service-health?service=${encodeURIComponent(service)}`,
      {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      },
    );
    const json = (await res.json().catch(() => null)) as
      | { data?: { events?: ServiceHealthEvent[] }; error?: string }
      | null;
    if (!res.ok) return { ok: false, error: json?.error ?? `Upstream ${res.status}` };
    return { ok: true, events: json?.data?.events ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Request failed" };
  }
}
