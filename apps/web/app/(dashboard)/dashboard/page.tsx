"use client";
import { useState, useMemo } from "react";
import { useSignalFeed } from "@/hooks/useSignalFeed";
import type { Signal } from "@blue-beacon-research/shared";

/* ─── Static placeholder data (fallback/demo) ────────────────────────────── */
const FALLBACK_FEATURED: any = {
  id: "feat-1",
  badge: "PRIORITY: CRITICAL",
  title: "Emergency Sanction Policy: East Asian Tech Corridors",
  summary: "Intelligence indicates an immediate shift in trade compliance for semiconductors and rare earth minerals. Expected supply chain disruption index: 8.4/10.",
  timeAgo: "2 MINS AGO",
  impact: "Global Supply",
  volatility: "+14.2%",
};

const MARKETS = [
  { label: "VIX INDEX", risk: "High Risk", riskColor: "#4edea3", vol: "8.8", trend: "BULLISH", pct: 65, val: "+2.4%" },
];

const SIGNAL_VELOCITY = [20, 35, 25, 60, 85, 70, 45, 30, 95, 80, 65, 55];

export default function DashboardPage() {
  const { liveSignals } = useSignalFeed({ enabled: true });
  const [filter, setFilter] = useState<"all" | "high">("all");

  const featured = liveSignals.find(s => s.severity >= 8) || FALLBACK_FEATURED;
  const feedList = useMemo(() => {
    return liveSignals.length > 0 ? liveSignals.slice(0, 10) : [
      { id: 'm1', title: 'CBDC Phase 2 Expansion', severity: 4, confidence: 94, timeStr: '09:12' },
      { id: 'm2', title: 'Rare Earth Supply Shock', severity: 4, confidence: 88, timeStr: '08:45' },
      { id: 'm3', title: 'Black Sea Grain Corridor', severity: 4, confidence: 97, timeStr: '08:21' },
    ];
  }, [liveSignals]);

  return (
    <div className="flex h-screen w-full pt-16" style={{ backgroundColor: "#0e0e0e" }}>
      {/* ── Center: Intelligence Feed (Main Canvas) ────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto" style={{ padding: "32px", maxWidth: "1440px", margin: "0 auto" }}>
        
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}>
            Intelligence Feed
          </h1>
          <p className="text-[14px] mt-1" style={{ color: "#acabaa", fontFamily: "'Inter', sans-serif" }}>
            Real-time global signal monitoring
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setFilter("all")}
            className="px-4 py-1.5 text-[11px] font-bold tracking-widest border transition-colors"
            style={{ 
              fontFamily: "'Space Grotesk', sans-serif",
              backgroundColor: filter === "all" ? "#4edea3" : "#201f1f", 
              color: filter === "all" ? "#005f40" : "#bbcac0",
              borderColor: filter === "all" ? "#4edea3" : "#3c4a42"
            }}
          >
            ALL SIGNALS
          </button>
          <button
            onClick={() => setFilter("high")}
            className="px-4 py-1.5 text-[11px] font-bold tracking-widest border transition-colors"
            style={{ 
              fontFamily: "'Space Grotesk', sans-serif",
              backgroundColor: filter === "high" ? "#4edea3" : "#201f1f", 
              color: filter === "high" ? "#005f40" : "#bbcac0",
              borderColor: filter === "high" ? "#4edea3" : "#3c4a42"
            }}
          >
            HIGH RISK
          </button>
        </div>

        {/* ── Featured Critical Card ────────────────────────────────── */}
        <section className="mb-10 relative overflow-hidden" style={{ backgroundColor: "#131313", border: "1px solid #3c4a42" }}>
          {/* Status Ribbon */}
          <div className="absolute top-0 left-0 w-full h-[4px]" style={{ backgroundColor: featured.severity >= 8 ? "#ee7d77" : "#4edea3" }} />
          
          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex gap-4 items-center">
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-tighter" 
                  style={{ 
                    fontFamily: "'Space Grotesk', sans-serif",
                    backgroundColor: featured.severity >= 8 ? "#7f2927" : "#262626", 
                    color: featured.severity >= 8 ? "#ff9993" : "#4edea3" 
                  }}>
                  {featured.severity >= 8 ? "PRIORITY: CRITICAL" : (featured.type || "SIGNAL")}
                </span>
                <span className="text-[11px]" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#86948a" }}>
                  ID: {featured.id?.slice(0, 8).toUpperCase() || "SIG-8829-X"}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#86948a" }}>
                {featured.timeAgo || "2 MINS AGO"}
              </span>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-end">
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-4 leading-tight" style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}>
                  {featured.title}
                </h2>
                
                <div className="flex gap-10">
                  <div>
                    <div className="text-[10px] uppercase mb-1" style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}>Impact Radius</div>
                    <div className="text-sm font-bold" style={{ color: "#4edea3", fontFamily: "'Inter', sans-serif" }}>{featured.impact || "Global Supply"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase mb-1" style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}>Volatility</div>
                    <div className="text-sm font-bold" style={{ color: "#4edea3", fontFamily: "'Inter', sans-serif" }}>{featured.volatility || "+14.2%"}</div>
                  </div>
                </div>
              </div>
              
              <button
                className="font-bold text-xs tracking-widest px-8 py-3 transition-all active:scale-95 duration-75"
                style={{ backgroundColor: "#4edea3", color: "#003824", fontFamily: "'Space Grotesk', sans-serif" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#6ffbbe"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#4edea3"; }}
              >
                ANALYZE IMPACT
              </button>
            </div>
          </div>
        </section>

        {/* ── Secondary Intelligence Grid ────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
          {/* Card A: Geopolitical Status */}
          <article className="group cursor-pointer transition-colors" style={{ backgroundColor: "#131313", border: "1px solid #3c4a42" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#2a2a2a"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#131313"; }}>
            <div className="h-48 w-full overflow-hidden relative" style={{ backgroundColor: "#2a2a2a" }}>
              <img 
                src="https://images.unsplash.com/photo-1578496479914-7ef3b0af6a4d?auto=format&fit=crop&w=700&q=80" 
                alt="Tactical context" 
                className="w-full h-full object-cover grayscale opacity-60 group-hover:opacity-100 transition-opacity"
              />
              <div className="absolute top-4 left-4 px-2 py-1 backdrop-blur-md" style={{ backgroundColor: "rgba(19,19,19,0.8)", border: "1px solid rgba(78,222,163,0.2)" }}>
                <span className="text-[10px] font-bold tracking-widest" style={{ color: "#4edea3", fontFamily: "'Space Grotesk', sans-serif" }}>
                  GEOPOLITICAL STATUS
                </span>
              </div>
            </div>
            <div className="p-6">
              <div className="text-[10px] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#86948a" }}>14 MINS AGO</div>
              <h3 className="text-lg font-bold mb-3" style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}>Escalating Tensions: East Africa Transit Routes</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "#bbcac0", fontFamily: "'Inter', sans-serif" }}>Recent developments in the Bab-el-Mandeb strait indicate potential rerouting of oil tankers. Maritime risk indices spiking.</p>
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 text-[10px] uppercase border" style={{ backgroundColor: "#2a2a2a", color: "#86948a", borderColor: "#3c4a42", fontFamily: "'Space Grotesk', sans-serif" }}>Maritime</span>
                  <span className="px-2 py-0.5 text-[10px] uppercase border" style={{ backgroundColor: "#2a2a2a", color: "#86948a", borderColor: "#3c4a42", fontFamily: "'Space Grotesk', sans-serif" }}>Logistics</span>
                </div>
                <span className="material-symbols-outlined text-xl" style={{ color: "#4edea3" }}>trending_up</span>
              </div>
            </div>
          </article>

          {/* Card B: Market Drift */}
          <article className="group cursor-pointer transition-colors" style={{ backgroundColor: "#131313", border: "1px solid #3c4a42" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#2a2a2a"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#131313"; }}>
            <div className="h-48 w-full overflow-hidden flex items-center justify-center p-8 relative" style={{ backgroundColor: "#1c1b1b" }}>
               <div className="flex items-end gap-1.5 h-full w-full">
                 {SIGNAL_VELOCITY.map((h, i) => (
                   <div key={i} className="w-full" style={{ height: `${h}%`, backgroundColor: "#4edea3" }} />
                 ))}
               </div>
               <div className="absolute top-4 left-4 px-2 py-1 backdrop-blur-md" style={{ backgroundColor: "rgba(19,19,19,0.8)", border: "1px solid rgba(78,222,163,0.2)" }}>
                <span className="text-[10px] font-bold tracking-widest" style={{ color: "#4edea3", fontFamily: "'Space Grotesk', sans-serif" }}>
                  MARKET DRIFT
                </span>
              </div>
            </div>
            <div className="p-6">
              <div className="text-[10px] mb-2" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#86948a" }}>42 MINS AGO</div>
              <h3 className="text-lg font-bold mb-3" style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}>Automated Execution: Energy Futures Divergence</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "#bbcac0", fontFamily: "'Inter', sans-serif" }}>Algorithm-driven selling pressure observed in Brent Crude near 08:00 UTC. Divergence from historical seasonal patterns.</p>
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <span className="px-2 py-0.5 text-[10px] uppercase border" style={{ backgroundColor: "#2a2a2a", color: "#86948a", borderColor: "#3c4a42", fontFamily: "'Space Grotesk', sans-serif" }}>Energy</span>
                  <span className="px-2 py-0.5 text-[10px] uppercase border" style={{ backgroundColor: "#2a2a2a", color: "#86948a", borderColor: "#3c4a42", fontFamily: "'Space Grotesk', sans-serif" }}>Automated</span>
                </div>
                <span className="material-symbols-outlined text-xl" style={{ color: "#4edea3" }}>bolt</span>
              </div>
            </div>
          </article>
        </div>

        {/* ── Intelligence Feed List ────────────────────────────── */}
        <section className="border" style={{ backgroundColor: "#0e0e0e", borderColor: "#3c4a42" }}>
          <div className="p-4 border-b flex justify-between items-center" style={{ borderColor: "#3c4a42" }}>
            <h4 className="text-[11px] font-bold tracking-widest uppercase" style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}>Recent Signal Stream</h4>
            <span className="text-[10px]" style={{ color: "#4edea3", fontFamily: "'JetBrains Mono', monospace" }}>LIVE DATA FEED ON</span>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(60,74,66,0.3)" }}>
            {feedList.length > 0 ? feedList.map((item: any, idx) => (
              <div 
                key={item.id} 
                className="px-6 py-4 flex items-center gap-6 cursor-pointer group transition-colors"
                style={{ backgroundColor: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#393939"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.severity >= 7 ? "#ee7d77" : "#4edea3" }} />
                <div className="w-16 text-[12px]" style={{ color: "#86948a", fontFamily: "'JetBrains Mono', monospace" }}>
                   {item.timeStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="flex-1 font-semibold transition-colors" style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}>
                  {item.title}
                </div>
                <div className="text-[12px] px-2 py-0.5 border" style={{ color: "#4edea3", backgroundColor: "rgba(78,222,163,0.1)", borderColor: "rgba(78,222,163,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.confidence || 94}% CONFIDENCE
                </div>
                <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform" style={{ color: "#86948a" }}>chevron_right</span>
              </div>
            )) : (
              <div className="py-20 text-center flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: "rgba(78,222,163,0.2)", borderTopColor: "#4edea3" }} />
                <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}>Waiting for live intelligence stream...</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ── Right: Market & AI Sidebar ────────────────────────── */}
      <aside className="w-[260px] shrink-0 border-l flex flex-col overflow-y-auto hidden xl:flex" style={{ borderColor: "#2a2a2a", backgroundColor: "#0e0e0e" }}>
        <div className="p-6">
          <div className="mb-8">
            <div className="text-sm font-bold" style={{ color: "#4edea3", fontFamily: "'Space Grotesk', sans-serif" }}>MARKET & AI</div>
            <div className="text-[10px] tracking-widest mt-1" style={{ color: "#bbcac0", fontFamily: "'Space Grotesk', sans-serif" }}>REAL-TIME SYNTHESIS</div>
          </div>

          <div className="space-y-6">
            {/* AI Module */}
            <div className="p-4 border" style={{ backgroundColor: "#0e0e0e", borderColor: "#3c4a42" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sm" style={{ color: "#4edea3" }}>psychology</span>
                <span className="text-[10px]" style={{ color: "#4edea3", fontFamily: "'Space Grotesk', sans-serif" }}>SENTINEL AI</span>
              </div>
              <div className="text-xs leading-relaxed mb-4" style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}>
                Detecting anomaly in <span className="font-mono" style={{ color: "#4edea3" }}>XAU/USD</span>. Potential liquidity drain in Central European sectors.
              </div>
              <div className="h-1 w-full overflow-hidden" style={{ backgroundColor: "#2a2a2a" }}>
                <div className="h-full w-2/3" style={{ backgroundColor: "#4edea3" }} />
              </div>
              <div className="mt-2 text-[10px] flex justify-between" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#86948a" }}>
                <span>CONFIDENCE</span>
                <span>82.4%</span>
              </div>
            </div>

            {/* Market Module */}
            <div className="p-4 border" style={{ backgroundColor: "#0e0e0e", borderColor: "#3c4a42" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sm" style={{ color: "#4edea3" }}>analytics</span>
                <span className="text-[10px] tracking-widest uppercase" style={{ color: "#4edea3", fontFamily: "'Space Grotesk', sans-serif" }}>Volatility Stats</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-end h-8 gap-0.5">
                  <div className="w-full h-1/2" style={{ backgroundColor: "rgba(78,222,163,0.2)" }} />
                  <div className="w-full h-3/4" style={{ backgroundColor: "rgba(78,222,163,0.4)" }} />
                  <div className="w-full h-full" style={{ backgroundColor: "#4edea3" }} />
                  <div className="w-full h-2/3" style={{ backgroundColor: "rgba(78,222,163,0.6)" }} />
                  <div className="w-full h-1/4" style={{ backgroundColor: "rgba(78,222,163,0.3)" }} />
                  <div className="w-full h-4/5" style={{ backgroundColor: "rgba(78,222,163,0.8)" }} />
                </div>
                <div className="flex justify-between text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace", color: "#e5e2e1" }}>
                  <span>VIX INDEX</span>
                  <span style={{ color: "#4edea3" }}>+2.4%</span>
                </div>
              </div>
            </div>

            {/* Hotzones */}
            <div className="p-4 border" style={{ backgroundColor: "#0e0e0e", borderColor: "#3c4a42" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sm" style={{ color: "#4edea3" }}>radar</span>
                <span className="text-[10px]" style={{ color: "#4edea3", fontFamily: "'Space Grotesk', sans-serif" }}>ACTIVE HOTZONES</span>
              </div>
              <ul className="space-y-2 text-[10px]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <li className="flex items-center justify-between">
                  <span style={{ color: "#e5e2e1" }}>RED SEA</span>
                  <span className="font-bold" style={{ color: "#ffb4ab" }}>HIGH</span>
                </li>
                <li className="flex items-center justify-between">
                  <span style={{ color: "#e5e2e1" }}>MALACCA STR.</span>
                  <span style={{ color: "#4edea3" }}>STABLE</span>
                </li>
                <li className="flex items-center justify-between">
                  <span style={{ color: "#e5e2e1" }}>SUEZ CANAL</span>
                  <span style={{ color: "#ffb3ad" }}>MED</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
