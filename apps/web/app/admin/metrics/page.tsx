import Link from "next/link";
import { notFound } from "next/navigation";

import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Founder-internal. Always render fresh — this is a live metrics snapshot.
export const dynamic = "force-dynamic";

type Metrics = {
  generated_at: string;
  signups: { all_time: number; last_7d: number };
  auth_users_all_time: number;
  dau: number;
  wau: number;
  waitlist_count: number;
  events_last_7d: { event_type: string; count: number }[];
};

async function loadMetrics(accessToken: string): Promise<Metrics | { error: string }> {
  const apiBase = process.env.API_URL;
  if (!apiBase) return { error: "Missing API_URL env var" };
  try {
    const res = await fetch(`${apiBase}/v1/admin/metrics`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { data?: Metrics; error?: string } | null;
    if (!res.ok) return { error: json?.error ?? `Upstream ${res.status}` };
    if (!json?.data) return { error: "Malformed upstream response" };
    return json.data;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Request failed" };
  }
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card className="bg-[#131313] ring-[#3c4a42]/60">
      <CardHeader>
        <CardTitle className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#8a9a92]">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-3xl font-semibold text-[#e5e2e1]">{value}</p>
        {hint ? (
          <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.15em] text-[#6b7a72]">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function AdminMetricsPage() {
  const clients = await getRouteSupabaseClients();
  if (!clients?.user || !isAdminEmail(clients.user.email)) notFound();

  const {
    data: { session },
  } = await clients.supabaseAuth.auth.getSession();
  if (!session?.access_token) notFound();

  const metrics = await loadMetrics(session.access_token);

  return (
    <div className="min-h-screen bg-[#0e0e0e] px-6 py-10 text-[#e5e2e1]">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#6b7a72]">
            Blue Beacon Research · Founder Console
          </p>
          <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.15em]">Usage Metrics</h1>
          <p className="text-[11px] font-mono text-[#8a9a92]">
            Signed in as {clients.user.email}
          </p>
        </header>

        {"error" in metrics ? (
          <div className="rounded-xl border border-[#7a3c3c] bg-[#1a1010] px-4 py-3 font-mono text-[12px] text-[#e0a0a0]">
            Failed to load metrics: {metrics.error}
          </div>
        ) : (
          <>
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#6b7a72]">
              Generated {new Date(metrics.generated_at).toISOString()} · windows are UTC
            </p>

            <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Stat
                label="Signups (all-time)"
                value={metrics.signups.all_time}
                hint={`${metrics.auth_users_all_time} auth accounts`}
              />
              <Stat label="Signups (7d)" value={metrics.signups.last_7d} />
              <Stat label="Waitlist" value={metrics.waitlist_count} />
              <Stat label="DAU" value={metrics.dau} hint="distinct users active today" />
              <Stat label="WAU" value={metrics.wau} hint="distinct users active in 7d" />
            </section>

            <section className="space-y-3">
              <h2 className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#8a9a92]">
                Events by type · last 7 days
              </h2>
              <div className="overflow-hidden rounded-xl ring-1 ring-[#3c4a42]/60">
                <table className="w-full font-mono text-[12px]">
                  <thead>
                    <tr className="bg-[#131313] text-left text-[10px] uppercase tracking-[0.2em] text-[#6b7a72]">
                      <th className="px-4 py-2 font-medium">Event type</th>
                      <th className="px-4 py-2 text-right font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.events_last_7d.length === 0 ? (
                      <tr className="bg-[#0e0e0e]">
                        <td colSpan={2} className="px-4 py-3 text-[#6b7a72]">
                          No events in the last 7 days
                        </td>
                      </tr>
                    ) : (
                      metrics.events_last_7d.map((row, i) => (
                        <tr key={row.event_type} className={i % 2 ? "bg-[#101010]" : "bg-[#0e0e0e]"}>
                          <td className="px-4 py-2 text-[#e5e2e1]">{row.event_type}</td>
                          <td className="px-4 py-2 text-right text-[#e5e2e1]">{row.count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <Link
          href="/dashboard"
          className="inline-block text-[10px] font-mono uppercase tracking-[0.2em] text-[#8a9a92] hover:text-[#e5e2e1]"
        >
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
