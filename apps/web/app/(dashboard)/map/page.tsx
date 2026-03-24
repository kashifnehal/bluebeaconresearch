"use client";
import { useQuery } from "@tanstack/react-query";
import type { Signal } from "@geosignal/shared";
import { formatDistanceToNowStrict } from "date-fns";

export default function MapPage() {
  const { data } = useQuery({
    queryKey: ["signals", "feed"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      return (await res.json()) as { signals: Signal[] };
    },
    refetchInterval: 30_000,
  });

  const signals = data?.signals ?? [];
  const liveItems = signals.slice(0, 6);

  // BlueBeaconResearch Glassmorphism Style
  const glassStyle = {
    background: "rgba(19, 19, 19, 0.6)",
    backdropFilter: "blur(20px)",
    border: "1px solid #484848",
  };

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden" style={{ backgroundColor: "#0e0e0e" }}>
      {/* ── Background Tactical Canvas (Map) ────────────────────────── */}
      <div className="absolute inset-0 z-0 bg-black">
        <div
          className="w-full h-full opacity-30 bg-cover bg-center grayscale brightness-[0.4] contrast-125"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=2000')" }}
        />
        {/* Tactical scanning lines effect */}
        <div className="absolute inset-0 pointer-events-none opacity-5" style={{ backgroundImage: "linear-gradient(rgba(78, 222, 163, 0.1) 1px, transparent 1px)", backgroundSize: "100% 4px" }} />
        {/* Glow gradients */}
        <div className="absolute top-0 left-0 w-full h-[30%] bg-gradient-to-b from-bg-app to-transparent" />
        <div className="absolute bottom-0 left-0 w-full h-[30%] bg-gradient-to-t from-bg-app to-transparent" />
      </div>

      {/* ── Hotspot Markers ─────────────────────────────────────────── */}
      {/* Europe Signal */}
      <div className="absolute top-[35%] left-[45%] z-10 group">
        <div className="relative">
          <div className="w-5 h-5 rounded-full bg-accent animate-ping opacity-40 absolute -top-1.5 -left-1.5" />
          <div className="w-2 h-2 rounded-full bg-accent relative z-10 shadow-[0_0_10px_#4edea3]" />
          
          <div className="absolute top-6 left-6 p-3 rounded-sm min-w-[160px] opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0" style={glassStyle}>
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold mb-1" style={{ color: "#4edea3", fontFamily: "'Space Grotesk', sans-serif" }}>Signal: Gamma-44</p>
            <p className="text-xs font-bold mb-1" style={{ color: "#e5e2e1" }}>Energy Drift: North Sea</p>
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span style={{ color: "#86948a" }}>Confidence</span>
              <span style={{ color: "#4edea3" }}>98.4%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Asia Signal */}
      <div className="absolute top-[45%] left-[75%] z-10 group">
        <div className="relative">
          <div className="w-4 h-4 rounded-full bg-danger animate-pulse absolute -top-1 -left-1 opacity-50" />
          <div className="w-2 h-2 rounded-full bg-danger relative z-10 shadow-[0_0_12px_#ee7d77]" />
          
          <div className="absolute top-6 left-6 p-3 rounded-sm min-w-[160px] opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0" style={glassStyle}>
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold mb-1" style={{ color: "#ee7d77", fontFamily: "'Space Grotesk', sans-serif" }}>Priority: Critical</p>
            <p className="text-xs font-bold mb-1" style={{ color: "#e5e2e1" }}>Taiwan Supply Blockade</p>
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span style={{ color: "#86948a" }}>Risk Level</span>
              <span style={{ color: "#ee7d77" }}>9.8 IMMINENT</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Floating Tactical Overlays ─────────────────────────────── */}
      
      {/* 1. Global Tension Monitor (Top Left) */}
      <div className="absolute top-8 left-8 z-20 w-[320px] flex flex-col gap-6">
        <div className="p-6 rounded-lg shadow-2xl" style={glassStyle}>
          <header className="flex justify-between items-start mb-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] font-black mb-1" style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}>Global Tension Index</p>
              <h2 className="text-4xl font-extrabold tracking-tighter" style={{ color: "#e5e2e1", fontFamily: "Inter, sans-serif" }}>
                74.8 <span className="text-sm font-bold align-top" style={{ color: "#ee7d77" }}>▲ 2.4</span>
              </h2>
            </div>
            <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center border border-white/10">
               <span className="material-symbols-outlined text-accent" style={{ fontFamily: "Material Symbols Outlined" }}>verified_user</span>
            </div>
          </header>

          <div className="flex flex-col gap-5">
            {[
              { label: "Trade Compliance", value: 88, color: "#4edea3" },
              { label: "Navigational Risk", value: 65, color: "#f4fed3" },
              { label: "Commodity Volatility", value: 92, color: "#ee7d77" },
            ].map(r => (
              <div key={r.label}>
                <div className="flex justify-between text-[10px] uppercase font-bold tracking-[0.15em] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  <span style={{ color: "#acabaa" }}>{r.label}</span>
                  <span style={{ color: r.color }}>{r.value}%</span>
                </div>
                <div className="h-1 bg-black/40 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${r.value}%`, backgroundColor: r.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tactical Quick Search */}
        <div className="p-4 rounded-lg flex items-center gap-4" style={glassStyle}>
           <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined", color: "#4edea3" }}>radar</span>
           <input 
             className="bg-transparent border-none text-xs w-full focus:ring-0 outline-none" 
             style={{ color: "#e5e2e1" }}
             placeholder="SCAN COORDINATES OR REGION..."
           />
        </div>
      </div>

      {/* 2. Intelligence Legend (Right side) */}
      <div className="absolute top-8 right-8 bottom-8 z-20 w-[340px] flex flex-col gap-6">
        <div className="flex-1 rounded-lg flex flex-col overflow-hidden shadow-2xl" style={glassStyle}>
          <header className="p-5 border-b flex justify-between items-center" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
             <div className="flex items-center gap-3">
               <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
               <h3 className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: "#e5e2e1", fontFamily: "'Space Grotesk', sans-serif" }}>Tactical Stream</h3>
             </div>
             <button className="text-[9px] font-bold uppercase tracking-widest text-muted hover:text-accent transition-colors">Filter</button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-6">
            {liveItems.length > 0 ? liveItems.map((signal, i) => {
              const isUrgent = signal.severity >= 8;
              return (
                <div key={signal.id} className="group cursor-pointer">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-sm border" 
                      style={{ 
                        backgroundColor: isUrgent ? "rgba(127, 41, 39, 0.2)" : "rgba(78, 222, 163, 0.1)", 
                        color: isUrgent ? "#ee7d77" : "#4edea3",
                        borderColor: isUrgent ? "rgba(127, 41, 39, 0.2)" : "rgba(78, 222, 163, 0.2)"
                      }}>
                      {isUrgent ? "Critical" : "Active"}
                    </span>
                    <span className="text-[9px] font-mono text-muted uppercase">
                      {formatDistanceToNowStrict(new Date(signal.createdAt)).replace(' seconds', 's').replace(' minutes', 'm')} ago
                    </span>
                  </div>
                  <h4 className="text-sm font-bold leading-snug group-hover:text-accent transition-colors mb-2" style={{ color: "#e5e2e1" }}>
                    {signal.title}
                  </h4>
                  <div className="flex gap-4 font-mono text-[9px] uppercase" style={{ color: "#86948a" }}>
                    <span>CON: 94.2%</span>
                    <span>GEO: 34.2N 118.4E</span>
                  </div>
                  {i < liveItems.length - 1 && <div className="mt-6 border-b" style={{ borderColor: "rgba(72,72,72,0.15)" }} />}
                </div>
              );
            }) : (
              <div className="flex-1 flex flex-col items-center justify-center p-10 opacity-40">
                <span className="material-symbols-outlined text-4xl mb-2 animate-spin" style={{ fontFamily: "Material Symbols Outlined" }}>sync</span>
                <p className="text-[10px] font-bold uppercase tracking-widest text-center">Syncing Geo-Channel...</p>
              </div>
            )}
          </div>

          <footer className="p-4 bg-black/40 border-t" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
            <button 
              onClick={() => window.location.href='/dashboard'}
              className="w-full py-3 rounded-sm bg-accent text-bg-app text-[10px] font-black uppercase tracking-[0.2em] shadow-[0_0_20px_rgba(78,222,163,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Initialize Intelligence Terminal
            </button>
          </footer>
        </div>

        {/* Environment Profile (Bottom Right Overlay) */}
        <div className="p-5 rounded-lg flex flex-col gap-4 shadow-xl" style={glassStyle}>
           <div className="flex justify-between items-center">
             <span className="text-[10px] font-bold uppercase tracking-widest text-muted" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Profile: Sentinel-X</span>
             <span className="text-[10px] font-mono text-accent">LEVEL 4 AUTH</span>
           </div>
           <div className="flex gap-4">
              <div className="w-12 h-12 rounded bg-accent/20 border border-accent/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-accent" style={{ fontFamily: "Material Symbols Outlined" }}>fingerprint</span>
              </div>
              <div className="flex flex-col justify-center gap-1">
                 <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                   <div className="h-full bg-accent" style={{ width: "74%" }} />
                 </div>
                 <span className="text-[9px] font-mono text-muted uppercase">Sync Reliability: 99.98%</span>
              </div>
           </div>
        </div>
      </div>

      {/* 3. Tactical Ticker (Bottom Center) ── Fixed width narrow bar */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 px-10 py-3 rounded-full shadow-2xl flex items-center gap-12" style={{ ...glassStyle, minWidth: "600px" }}>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: "#e5e2e1", fontFamily: "'Space Grotesk', sans-serif" }}>Live Volatility Feed</span>
        </div>
        <div className="flex-1 flex items-center gap-12 overflow-hidden whitespace-nowrap mask-fade-edges font-mono text-[11px]">
          {[
            { label: "WTI CRUDE", val: "74.12 (+0.4%)", up: true },
            { label: "BRENT", val: "82.50 (-0.2%)", up: false },
            { label: "XAU/USD", val: "2,154.20 (+0.8%)", up: true },
            { label: "BTC", val: "64,281 (+1.4%)", up: true },
          ].map(t => (
            <div key={t.label} className="flex items-center gap-3">
               <span style={{ color: "#86948a" }}>{t.label}</span>
               <span style={{ color: t.up ? "var(--price-up)" : "var(--price-down)" }}>{t.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Zoom Controls (Bottom Left) */}
      <div className="absolute bottom-10 left-10 z-30 flex flex-col gap-3">
         <div className="flex flex-col rounded-md overflow-hidden bg-surface shadow-xl" style={{ border: "1px solid #484848" }}>
            <button className="w-10 h-10 flex items-center justify-center hover:bg-white/5 transition-colors border-b" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
              <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined", color: "#e5e2e1" }}>add</span>
            </button>
            <button className="w-10 h-10 flex items-center justify-center hover:bg-white/5 transition-colors">
              <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined", color: "#e5e2e1" }}>remove</span>
            </button>
         </div>
         <button className="w-10 h-10 rounded-md bg-surface flex items-center justify-center shadow-xl hover:bg-white/5 transition-colors" style={{ border: "1px solid #484848" }}>
            <span className="material-symbols-outlined text-sm" style={{ fontFamily: "Material Symbols Outlined", color: "#4edea3" }}>layers</span>
         </button>
      </div>

      <style jsx>{`
        .mask-fade-edges {
          mask-image: linear-gradient(to right, transparent, black 15%, black 85%, transparent);
        }
      `}</style>
    </div>
  );
}

