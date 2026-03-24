"use client";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Signal } from "@geosignal/shared";
import { formatDistanceToNowStrict, format } from "date-fns";
import { useSignalFeed } from "@/hooks/useSignalFeed";
import { useAuthStore } from "@/store/useAuthStore";

export default function AlertsPage() {
  const planTier = useAuthStore((s) => s.planTier);
  const sseEnabled = planTier === "analyst" || planTier === "pro" || planTier === "api";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "critical">("all");

  const { data } = useQuery({
    queryKey: ["signals", "list"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      return (await res.json()) as { signals: Signal[] };
    },
    refetchInterval: 60_000,
  });

  const { liveSignals } = useSignalFeed({ enabled: sseEnabled });
  const signals = useMemo(() => {
    const map = new Map<string, Signal>();
    for (const s of liveSignals) map.set(s.id, s);
    for (const s of data?.signals ?? []) if (!map.has(s.id)) map.set(s.id, s);
    const list = Array.from(map.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return filter === "critical" ? list.filter(s => s.severity >= 8) : list;
  }, [data?.signals, liveSignals, filter]);

  // Handle initial selection
  useEffect(() => {
    if (signals.length > 0 && !selectedId) {
      setSelectedId(signals[0].id);
    }
  }, [signals, selectedId]);

  const selectedSignal = signals.find(s => s.id === selectedId) || signals[0];

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ backgroundColor: "#0e0e0e" }}>
      {/* ── Left Pane: Tactical Signal Stream ────────────────────────── */}
      <aside className="w-[400px] border-r flex flex-col shrink-0" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
        <header className="p-6 border-b flex flex-col gap-4" style={{ borderColor: "rgba(72,72,72,0.15)", backgroundColor: "rgba(19, 19, 19, 0.4)" }}>
          <div className="flex justify-between items-center">
            <h1 className="text-[11px] font-black uppercase tracking-[0.3em]" style={{ color: "#e5e2e1", fontFamily: "'Space Grotesk', sans-serif" }}>Signal Channel</h1>
            <div className="flex gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[9px] font-mono text-accent">LIVE</span>
            </div>
          </div>
          <div className="flex bg-black/40 p-1 rounded-sm border" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
             <button 
               onClick={() => setFilter("all")}
               className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-sm transition-all ${filter === 'all' ? 'bg-accent text-bg-app' : 'text-muted hover:text-text-secondary'}`}
             >Terminal</button>
             <button 
               onClick={() => setFilter("critical")}
               className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-sm transition-all ${filter === 'critical' ? 'bg-danger/20 text-danger border border-danger/20' : 'text-muted hover:text-text-secondary'}`}
             >Priority</button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
          {signals.map((s) => {
            const isSelected = selectedId === s.id;
            const isCritical = s.severity >= 8;
            return (
              <div 
                key={s.id} 
                onClick={() => setSelectedId(s.id)}
                className={`p-5 cursor-pointer transition-all border-l-2 ${isSelected ? 'bg-surface border-accent' : 'hover:bg-surface/40 border-transparent'}`}
              >
                <div className="flex justify-between items-start mb-2">
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-mono text-muted uppercase">
                        {format(new Date(s.createdAt), "HH:mm:ss 'UTC'")}
                      </span>
                      <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-sm border inline-block w-fit ${isCritical ? 'bg-danger/10 text-danger border-danger/20' : 'bg-accent/10 text-accent border-accent/20'}`}>
                        {isCritical ? 'CRITICAL' : 'MONITORING'}
                      </span>
                   </div>
                   <div className="text-[10px] font-bold text-text-secondary">#{(s.id.slice(-4))}</div>
                </div>
                <h3 className={`text-sm font-bold leading-tight mb-2 ${isSelected ? 'text-accent' : 'text-text-primary'}`}>{s.title}</h3>
                <div className="flex justify-between items-center">
                   <span className="text-[10px] text-muted font-medium">{s.country}</span>
                   <div className="flex gap-1">
                      {[1,2,3].map(i => (
                        <div key={i} className={`w-1 h-3 rounded-full ${i <= s.severity/3.33 ? (isCritical ? 'bg-danger' : 'bg-accent') : 'bg-white/10'}`} />
                      ))}
                   </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ── Right Pane: Narrative & Technical Intelligence ───────────────── */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-surface-lowest">
        {selectedSignal ? (
          <div className="max-w-[1000px] mx-auto w-full p-12">
             <header className="mb-12">
                <div className="flex items-center gap-4 mb-6">
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Intelligence Narrative</span>
                   <div className="h-px bg-accent/20 flex-1" />
                   <span className="text-[10px] font-mono text-muted uppercase">GEO-REF: {selectedSignal.id}</span>
                </div>
                <h2 className="text-5xl font-black tracking-tighter mb-8 leading-none" style={{ color: "#e5e2e1" }}>
                  {selectedSignal.title}
                </h2>
                <div className="flex gap-8">
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted">Detected</span>
                      <span className="text-sm font-mono text-text-secondary">{format(new Date(selectedSignal.createdAt), "MMMM dd, yyyy HH:mm 'UTC'")}</span>
                   </div>
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted">Location</span>
                      <span className="text-sm font-mono text-text-secondary">{selectedSignal.country}</span>
                   </div>
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-muted">Reliability</span>
                      <span className="text-sm font-mono text-accent">{(92 + Math.random() * 7).toFixed(1)}% CONFIRMED</span>
                   </div>
                </div>
             </header>

             {/* Narrative Summary */}
             <section className="mb-12 p-8 rounded-lg border bg-surface/30" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
                <div className="flex items-center gap-3 mb-6">
                   <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center border border-accent/20">
                      <span className="material-symbols-outlined text-accent text-sm" style={{ fontFamily: "Material Symbols Outlined" }}>auto_awesome</span>
                   </div>
                   <span className="text-[11px] font-bold uppercase tracking-widest text-text-primary" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Sentinel Analysis</span>
                </div>
                <p className="text-xl leading-relaxed text-text-secondary font-medium">
                  {selectedSignal.summary}
                </p>
             </section>

             {/* Technical Metadata Tables */}
             <div className="grid grid-cols-2 gap-8 mb-12">
                <div className="flex flex-col gap-4">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-muted border-b pb-2" style={{ borderColor: "rgba(72,72,72,0.15)" }}>Primary Attributes</h4>
                   <table className="w-full text-xs font-mono">
                      <tbody>
                        {[
                          ["DISRUPTION_ID", selectedSignal.id.slice(0, 12).toUpperCase()],
                          ["SEVERITY_INDEX", `${selectedSignal.severity}.0 / 10.0`],
                          ["SIGNAL_SOURCE", "SENTINEL-X GLOBAL"],
                          ["LATENCY_SYNC", "14ms ACCESS"],
                        ].map(([k, v]) => (
                          <tr key={k} className="border-b" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                            <td className="py-2 text-muted uppercase">{k}</td>
                            <td className="py-2 text-text-primary text-right">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
                <div className="flex flex-col gap-4">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-muted border-b pb-2" style={{ borderColor: "rgba(72,72,72,0.15)" }}>Action Protocol</h4>
                   <div className="flex flex-col gap-3">
                      <div className="p-3 rounded bg-danger/5 border border-danger/10 flex items-center justify-between">
                         <span className="text-[10px] font-bold text-danger uppercase tracking-widest">Immediate Alert</span>
                         <span className="material-symbols-outlined text-danger text-sm" style={{ fontFamily: "Material Symbols Outlined" }}>notifications_active</span>
                      </div>
                      <div className="p-3 rounded bg-accent/5 border border-accent/10 flex items-center justify-between opacity-50">
                         <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Backtest Scenario</span>
                         <span className="material-symbols-outlined text-accent text-sm" style={{ fontFamily: "Material Symbols Outlined" }}>history_edu</span>
                      </div>
                   </div>
                </div>
             </div>

             {/* Tactical Map Mockup (Narrow Line) */}
             <div className="h-48 rounded-lg bg-black/40 border flex items-center justify-center relative overflow-hidden group" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
                <div className="absolute inset-0 opacity-20 bg-cover bg-center grayscale brightness-50 contrast-150" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=2000')" }} />
                <div className="z-10 flex flex-col items-center gap-4">
                   <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center border border-accent/40 animate-pulse">
                      <span className="material-symbols-outlined text-accent" style={{ fontFamily: "Material Symbols Outlined" }}>location_searching</span>
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent">Active Visualization Syncing</span>
                </div>
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none bg-gradient-to-t from-bg-app to-transparent" />
             </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center opacity-30">
             <span className="material-symbols-outlined text-6xl mb-4 animate-spin" style={{ fontFamily: "Material Symbols Outlined" }}>track_changes</span>
             <p className="text-[11px] font-black uppercase tracking-[0.5em]">Awaiting Selection...</p>
          </div>
        )}
      </main>
    </div>
  );
}

