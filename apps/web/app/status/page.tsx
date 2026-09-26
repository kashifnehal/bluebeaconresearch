import { PublicHeader } from "@/components/layout/PublicHeader";
import { LegalDisclaimerFooter } from "@/components/layout/LegalDisclaimerFooter";
import { getSystemChecks, type CheckStatus } from "@/lib/status-checks";

export const metadata = {
  title: "System Status | Blue Beacon Research",
  description: "Real-time infrastructure operational status for Blue Beacon Research.",
};

// Real checks run per request (not a cached/prerendered page) — see lib/status-checks.ts.
export const dynamic = "force-dynamic";

function statusColor(status: CheckStatus) {
  if (status === "Operational") return "#4edea3";
  if (status === "Degraded") return "#f5a623";
  return "#8a8a8a";
}

export default async function StatusPage() {
  const currentTime = new Date().toUTCString();
  const systems = await getSystemChecks();

  const operationalCount = systems.filter((s) => s.status === "Operational").length;
  const allOperational = operationalCount === systems.length;
  const uptimePct = Math.round((operationalCount / systems.length) * 100);
  const bannerColor = allOperational ? "#4edea3" : "#f5a623";

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PublicHeader badge="SYSTEM MONITOR" />

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-8 py-16">
        {/* Banner */}
        <div className="p-8 bg-[#131313] border border-[#3c4a42] rounded-lg mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-4 h-4 rounded-full animate-pulse" style={{ backgroundColor: bannerColor }} />
            <div>
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {allOperational ? "All Systems Operational" : "Partial System Disruption"}
              </h1>
              <p className="text-xs text-[#86948a] mt-1 font-mono">
                {allOperational
                  ? "All production microservices are running within normal parameters."
                  : "One or more subsystems are degraded or reporting an unknown state — see below."}
              </p>
            </div>
          </div>
          <span
            className="text-xs font-mono px-3 py-1 border rounded-sm"
            style={{ color: bannerColor, backgroundColor: `${bannerColor}1a`, borderColor: `${bannerColor}33` }}
          >
            {uptimePct}% OPERATIONAL
          </span>
        </div>

        {/* System List */}
        <section className="space-y-4 mb-12">
          <h2 className="text-xs font-bold text-[#86948a] uppercase tracking-widest mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Subsystem Operational Metrics
          </h2>

          <div className="divide-y divide-[#2a2a2a] border border-[#3c4a42] bg-[#131313] rounded-lg">
            {systems.map((sys) => (
              <div key={sys.name} className="p-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between hover:bg-[#1a1a1a] transition-colors">
                <div>
                  <h3 className="font-bold text-sm text-[#e5e2e1]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {sys.name}
                  </h3>
                  <p className="text-xs text-[#86948a] mt-0.5">{sys.detail}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColor(sys.status) }} />
                  <span
                    className="text-xs font-bold uppercase tracking-wider font-mono"
                    style={{ color: statusColor(sys.status) }}
                  >
                    {sys.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Timestamp */}
        <div className="text-center text-xs font-mono text-[#86948a] pt-8 border-t border-[#2a2a2a]">
          Last updated: {currentTime}
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 border-t border-[#2a2a2a] text-center text-xs text-[#86948a] font-mono">
        Blue Beacon Research Operational Dashboard • Automated Health Protocol
      </footer>
      <LegalDisclaimerFooter />
    </div>
  );
}
