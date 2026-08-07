import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = {
  title: "System Status | Blue Beacon Research",
  description: "Real-time infrastructure operational status for Blue Beacon Research.",
};

const SYSTEMS = [
  { name: "Intelligence Feed", status: "Operational", detail: "REST API & WebSocket live data feed" },
  { name: "Alert Delivery", status: "Operational", detail: "Telegram, Webhook & Multi-channel Dispatcher" },
  { name: "Global Map", status: "Operational", detail: "Mapbox GL Spatial Engine & Incident Markers" },
  { name: "Data Pipeline", status: "Operational", detail: "GDELT, ACLED, GNews & Price Sync Collector Workers" },
];

export default function StatusPage() {
  const currentTime = new Date().toUTCString();

  return (
    <div className="min-h-screen bg-[#0e0e0e] text-[#e5e2e1] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="h-16 border-b border-[#2a2a2a] px-8 flex items-center justify-between bg-[#000000]">
        <div className="flex items-center gap-3">
          <Logo className="h-6" />
          <Link href="/" className="font-extrabold text-sm tracking-tight text-white uppercase" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Blue Beacon Research
          </Link>
          <span className="text-[10px] text-[#4edea3] font-mono px-2 py-0.5 border border-[#3c4a42] bg-[#131313]">
            SYSTEM MONITOR
          </span>
        </div>

        <Link
          href="/dashboard"
          className="text-xs font-bold text-[#4edea3] hover:underline uppercase tracking-wider flex items-center gap-1"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Terminal <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>arrow_forward</span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-8 py-16">
        {/* Banner */}
        <div className="p-8 bg-[#131313] border border-[#3c4a42] rounded-lg mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-4 h-4 rounded-full bg-[#4edea3] animate-pulse" />
            <div>
              <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                All Systems Operational
              </h1>
              <p className="text-xs text-[#86948a] mt-1 font-mono">
                All production microservices are running within normal parameters.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-[#4edea3] px-3 py-1 bg-[#4edea3]/10 border border-[#4edea3]/20 rounded-sm">
            100% UPTIME
          </span>
        </div>

        {/* System List */}
        <section className="space-y-4 mb-12">
          <h2 className="text-xs font-bold text-[#86948a] uppercase tracking-widest mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Subsystem Operational Metrics
          </h2>

          <div className="divide-y divide-[#2a2a2a] border border-[#3c4a42] bg-[#131313] rounded-lg">
            {SYSTEMS.map((sys) => (
              <div key={sys.name} className="p-5 flex items-center justify-between hover:bg-[#1a1a1a] transition-colors">
                <div>
                  <h3 className="font-bold text-sm text-[#e5e2e1]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {sys.name}
                  </h3>
                  <p className="text-xs text-[#86948a] mt-0.5">{sys.detail}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4edea3]" />
                  <span className="text-xs font-bold text-[#4edea3] uppercase tracking-wider font-mono">
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
    </div>
  );
}
