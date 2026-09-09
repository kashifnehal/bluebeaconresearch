import Link from "next/link";
import { redirect } from "next/navigation";

import { getRouteSupabaseClients } from "@/lib/supabase-server";
import { isAdminEmail } from "@/lib/admin";

import ServiceStatusClient from "./ServiceStatusClient";

// Founder-internal. #42 Service Health Dashboard, Phase 1.
export const dynamic = "force-dynamic";

export default async function ServiceStatusPage() {
  const clients = await getRouteSupabaseClients();
  if (!clients?.user || !isAdminEmail(clients.user.email)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] px-6 py-10 text-[#e5e2e1]">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#6b7a72]">
            Blue Beacon Research · Founder Console
          </p>
          <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.15em]">
            Service Status
          </h1>
          <p className="text-[11px] font-mono text-[#8a9a92]">
            Signed in as {clients.user.email} · Phase 1 (event log only, no charts)
          </p>
        </header>

        <ServiceStatusClient />

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
