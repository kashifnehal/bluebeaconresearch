"use client";
import { useState, useMemo } from "react";
import { useSignalFeed } from "@/hooks/useSignalFeed";
import { useAuthStore } from "@/store/useAuthStore";
import type { Signal } from "@geosignal/shared";

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
  { label: "Crude Oil (WTI)", risk: "High Risk", riskColor: "#4edea3", vol: "8.8", trend: "BULLISH", pct: 88 },
  { label: "Freight (Baltic Dry)", risk: "Moderate", riskColor: "#f4fed3", vol: "4.2", trend: "NEUTRAL", pct: 42 },
  { label: "Tech Commodities", risk: "Extreme", riskColor: "#ee7d77", vol: "9.4", trend: "BEARISH", pct: 94 },
];

const SIGNAL_VELOCITY = [25, 45, 35, 60, 50, 80, 65, 90, 75, 100, 85, 95];

export default function DashboardPage() {
  const planTier = useAuthStore((s) => s.planTier);
  const { liveSignals } = useSignalFeed({ enabled: true });
  const [filter, setFilter] = useState<"all" | "high">("all");

  const featured = liveSignals.find(s => s.severity >= 8) || FALLBACK_FEATURED;
  const feedList = useMemo(() => {
    return liveSignals.length > 0 ? liveSignals.slice(0, 10) : [];
  }, [liveSignals]);

  return (
    <div className="flex h-full w-full" style={{ height: "calc(100vh - 64px)", backgroundColor: "#0e0e0e" }}>
      {/* ── Center: Intelligence Feed ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-10 py-8 flex flex-col gap-10">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tighter" style={{ color: "#e5e2e1", fontFamily: "Inter, sans-serif" }}>Intelligence Feed</h1>
            <p className="text-sm mt-1" style={{ color: "#acabaa" }}>Real-time global signal monitoring and automated risk assessment.</p>
          </div>
          <div className="flex bg-secondary rounded-lg p-1" style={{ backgroundColor: "#202020" }}>
            <button
              onClick={() => setFilter("all")}
              className={`px-6 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${filter === "all" ? "bg-accent text-bg-app shadow-lg" : "text-text-secondary hover:text-text-primary"}`}
              style={filter === "all" ? { backgroundColor: "#4edea3", color: "#0e0e0e" } : {}}
            >Global Stream</button>
            <button
              onClick={() => setFilter("high")}
              className={`px-6 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${filter === "high" ? "bg-accent text-bg-app shadow-lg" : "text-text-secondary hover:text-text-primary"}`}
              style={filter === "high" ? { backgroundColor: "#4edea3", color: "#0e0e0e" } : {}}
            >High Priority</button>
          </div>
        </div>

        {/* ── Featured Tactical Module ────────────────────────────────── */}
        <div
          className="rounded-xl overflow-hidden relative shadow-2xl transition-all hover:scale-[1.002]"
          style={{ backgroundColor: "#1a1919", border: "1px solid #484848" }}
        >
          {/* Status Ribbon */}
          <div className="h-0.5 w-full" style={{ backgroundColor: featured.severity >= 8 ? "#ee7d77" : "#4edea3" }} />
          
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <span className="px-3 py-1 rounded-sm text-[10px] font-bold uppercase tracking-widest" 
                  style={{ 
                    backgroundColor: featured.severity >= 8 ? "#7f2927" : "#262626", 
                    color: featured.severity >= 8 ? "#ff9993" : "#4edea3" 
                  }}>
                  {featured.severity >= 8 ? "PRIORITY: CRITICAL" : featured.type || "SIGNAL"}
                </span>
                <span className="text-[10px] font-mono" style={{ color: "#86948a" }}>ID: {featured.id?.slice(0, 8).toUpperCase() || "SIG-8829-X"}</span>
              </div>
              <span className="text-[10px] font-mono uppercase" style={{ color: "#86948a" }}>{featured.timeAgo || "2 MINS AGO"}</span>
            </div>

            <h2 className="text-3xl font-bold mb-4 leading-tight tracking-tight" style={{ color: "#e5e2e1" }}>{featured.title}</h2>
            <p className="text-base leading-relaxed mb-8 max-w-3xl" style={{ color: "#acabaa" }}>{featured.summary}</p>
            
            <div className="flex items-end justify-between border-t pt-8" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
              <div className="flex gap-12">
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-[0.2em] mb-2" style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}>Impact Radius</div>
                  <div className="text-lg font-bold" style={{ color: "#4edea3" }}>{featured.impact || "Global Supply Chain"}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold tracking-[0.2em] mb-2" style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}>Volatility Projection</div>
                  <div className="text-lg font-bold font-mono" style={{ color: "#4edea3" }}>{featured.volatility || "+14.2%"}</div>
                </div>
              </div>
              <button
                className="px-8 py-3 rounded-sm text-xs font-bold uppercase tracking-[0.15em] transition-all hover:brightness-110 active:scale-95"
                style={{ backgroundColor: "#4edea3", color: "#0e0e0e", boxShadow: "0 0 20px rgba(78, 222, 163, 0.2)" }}
              >
                Analyze Global Impact
              </button>
            </div>
          </div>
        </div>

        {/* ── Secondary Intelligence Grid ────────────────────────────── */}
        <div className="grid grid-cols-2 gap-8">
          {/* Geopolitical Card */}
          <div className="rounded-xl overflow-hidden flex flex-col group transition-all" style={{ backgroundColor: "#131313", border: "1px solid #484848" }}>
            <div className="h-48 relative overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1578496479914-7ef3b0af6a4d?auto=format&fit=crop&w=700&q=80" 
                alt="Tactical context" 
                className="w-full h-full object-cover grayscale opacity-40 group-hover:opacity-60 transition-opacity"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-transparent" />
              <div className="absolute top-4 left-4">
                <span className="px-2 py-1 bg-black/60 border border-accent/30 text-[9px] font-bold uppercase tracking-widest text-accent rounded-sm backdrop-blur-md">
                  Geopolitical Status
                </span>
              </div>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <span className="text-[10px] font-mono uppercase mb-2" style={{ color: "#86948a" }}>14 MINS AGO</span>
              <h3 className="text-xl font-bold mb-3 leading-snug" style={{ color: "#e5e2e1" }}>Escalating Tensions: East Africa Transit Routes</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "#acabaa" }}>Navigational risks identified in maritime channels. Insurance premiums for freight expected to rise within 24 hours.</p>
              <div className="mt-auto flex items-center justify-between font-mono">
                <div className="flex gap-2">
                  <span className="px-2 py-1 text-[10px] rounded-sm" style={{ backgroundColor: "#262626", color: "#acabaa" }}>MARITIME</span>
                  <span className="px-2 py-1 text-[10px] rounded-sm" style={{ backgroundColor: "#262626", color: "#acabaa" }}>LOGISTICS</span>
                </div>
                <span className="text-accent text-lg">↗</span>
              </div>
            </div>
          </div>

          {/* Market Drift Card */}
          <div className="rounded-xl overflow-hidden flex flex-col group transition-all" style={{ backgroundColor: "#131313", border: "1px solid #484848" }}>
            <div className="h-48 relative overflow-hidden bg-black flex items-end justify-between px-6 py-6 gap-1">
               {/* Background Grid Pattern */}
               <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(#484848 1px, transparent 1px), linear-gradient(90deg, #484848 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
               {SIGNAL_VELOCITY.map((h, i) => (
                 <div 
                   key={i} 
                   className="flex-1 rounded-t-sm transition-all duration-700" 
                   style={{ height: `${h}%`, backgroundColor: "#4edea3", opacity: 0.15 + (i / SIGNAL_VELOCITY.length) * 0.85 }} 
                 />
               ))}
               <div className="absolute top-4 left-4">
                <span className="px-2 py-1 bg-black/60 border border-accent/30 text-[9px] font-bold uppercase tracking-widest text-accent rounded-sm backdrop-blur-md">
                  Market Drift Index
                </span>
              </div>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <span className="text-[10px] font-mono uppercase mb-2" style={{ color: "#86948a" }}>42 MINS AGO</span>
              <h3 className="text-xl font-bold mb-3 leading-snug" style={{ color: "#e5e2e1" }}>Automated Execution: Energy Futures Divergence</h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "#acabaa" }}>Algorithmic trading patterns detected in European gas markets. Liquidity shifting toward mid-term fixed contracts.</p>
              <div className="mt-auto flex items-center justify-between font-mono">
                <div className="flex gap-2">
                  <span className="px-2 py-1 text-[10px] rounded-sm" style={{ backgroundColor: "#262626", color: "#acabaa" }}>ENERGY</span>
                  <span className="px-2 py-1 text-[10px] rounded-sm" style={{ backgroundColor: "#262626", color: "#acabaa" }}>QUANT</span>
                </div>
                <span className="text-accent text-lg">⚡</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Intelligence Feed List ────────────────────────────── */}
        <div className="flex flex-col mb-10 border-t" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
          {feedList.length > 0 ? feedList.map((item, idx) => (
            <div 
              key={item.id} 
              className="flex items-center gap-6 py-5 px-4 cursor-pointer hover:bg-white/5 group border-b transition-colors"
              style={{ borderColor: "rgba(72,72,72,0.15)" }}
            >
              <div className="w-2 h-2 rounded-full shadow-[0_0_8px_#4edea3]" style={{ backgroundColor: item.severity >= 7 ? "#ee7d77" : "#4edea3" }} />
              <div className="w-24 font-mono text-[11px] uppercase tracking-tighter" style={{ color: "#86948a" }}>
                 {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="flex-1 text-sm font-medium tracking-tight group-hover:text-accent transition-colors" style={{ color: "#e5e2e1" }}>
                {item.title}
              </div>
              <div className="flex items-center gap-8 font-mono text-[10px]">
                <div className="text-right">
                   <div className="text-text-muted" style={{ color: "#86948a" }}>CONFIDENCE</div>
                   <div style={{ color: "#e5e2e1" }}>{(item as any).confidence || 94}%</div>
                </div>
                <span style={{ color: "#86948a" }}>›</span>
              </div>
            </div>
          )) : (
            <div className="py-20 text-center flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
              <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: "#86948a" }}>Waiting for live intelligence stream...</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Tactical Analysis Sidebar ────────────────────────── */}
      <aside className="w-[300px] shrink-0 border-l flex flex-col overflow-hidden hidden 2xl:flex" style={{ borderColor: "#484848", backgroundColor: "#0e0e0e" }}>
        {/* Market Ticker Strip */}
        <div className="h-10 shrink-0 bg-black flex items-center overflow-hidden border-b whitespace-nowrap px-4" style={{ borderColor: "#484848" }}>
           <div className="flex items-center gap-8 animate-marquee font-mono text-[10px] uppercase">
             <span>CRUDE OIL <span className="text-accent">74.21 (+0.4%)</span></span>
             <span className="text-text-muted">|</span>
             <span>WTI <span className="text-danger">70.12 (-1.2%)</span></span>
             <span className="text-text-muted">|</span>
             <span>XAU/USD <span className="text-accent">2,154.20 (+0.8%)</span></span>
             <span className="text-text-muted">|</span>
             <span>TSMC <span className="text-accent">148.20 (+3.4%)</span></span>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-10">
          {/* Volatility Index */}
          <section>
             <header className="flex items-center justify-between mb-6">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}>Risk Volatility Map</h4>
                <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined", color: "#86948a" }}>query_stats</span>
             </header>
             <div className="flex flex-col gap-4">
                {MARKETS.map(m => (
                  <div key={m.label} className="p-4 rounded-lg border bg-surface flex flex-col gap-3" style={{ backgroundColor: "#131313", borderColor: "rgba(72,72,72,0.15)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold" style={{ color: "#e5e2e1" }}>{m.label}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm" style={{ color: m.riskColor, backgroundColor: "rgba(255,255,255,0.03)" }}>{m.risk}</span>
                    </div>
                    <div className="h-1 w-full bg-black/40 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${m.pct}%`, backgroundColor: m.riskColor }} />
                    </div>
                    <div className="flex justify-between font-mono text-[9px] uppercase" style={{ color: "#86948a" }}>
                      <span>VOL: {m.vol}</span>
                      <span>TREND: {m.trend}</span>
                    </div>
                  </div>
                ))}
             </div>
          </section>

          {/* AI Synthesis */}
          <section className="relative group">
             <div className="absolute inset-0 bg-accent/5 rounded-xl blur-xl group-hover:bg-accent/10 transition-colors" />
             <div className="relative p-6 rounded-xl border flex flex-col gap-4" style={{ backgroundColor: "rgba(19, 19, 19, 0.4)", backdropFilter: "blur(20px)", borderColor: "rgba(78, 222, 163, 0.2)" }}>
                <div className="flex items-center gap-2">
                   <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#4edea3" }} />
                   <h4 className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#4edea3", fontFamily: "'Space Grotesk', sans-serif" }}>Sentinel AI Synthesis</h4>
                </div>
                <p className="text-[11px] italic leading-relaxed" style={{ color: "#acabaa" }}>
                  &quot;Convergence detected between semiconductor export shifts in East Asia and European energy volatility. Probability of market repricing within 72h is <span className="font-bold text-accent">67%</span>. Recommendation: Increase exposure to freight-neutral hubs.&quot;
                </p>
                <button className="w-full py-2.5 rounded-sm text-[10px] font-bold uppercase tracking-widest border border-border hover:bg-white/5 transition-all" style={{ color: "#acabaa", backgroundColor: "#0e0e0e" }}>
                  Generate Full Protocol
                </button>
             </div>
          </section>

          {/* Active Hotzones */}
          <section>
             <header className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}>Active Operations</h4>
             </header>
             <div className="h-32 rounded-lg relative overflow-hidden bg-black grayscale border" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
                <img 
                  src="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=500&q=60" 
                  alt="Operations Map" 
                  className="w-full h-full object-cover opacity-30"
                />
                <div className="absolute top-1/3 left-1/4 w-3 h-3 bg-accent rounded-full animate-ping opacity-75" />
                <div className="absolute top-1/2 left-2/3 w-2 h-2 bg-danger rounded-full animate-ping opacity-75" />
             </div>
          </section>
        </div>

        {/* System Stats Footer */}
        <div className="p-4 bg-black border-t flex flex-col gap-4" style={{ borderColor: "#484848" }}>
           <div className="flex justify-between items-center text-[9px] font-mono" style={{ color: "#86948a" }}>
              <span>LATENCY: <span className="text-accent">14MS</span></span>
              <span>UPTIME: <span className="text-white">99.98%</span></span>
           </div>
           <button className="w-full py-3 rounded-full bg-gradient-to-r from-accent to-accent-subtle text-bg-app text-xs font-black uppercase tracking-[0.2em] shadow-[0_0_15px_rgba(78,222,163,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all">
              ⚡ Execute Protocol
           </button>
        </div>
      </aside>
    </div>
  );
}
