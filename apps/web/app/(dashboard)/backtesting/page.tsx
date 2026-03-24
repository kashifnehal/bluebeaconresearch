"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Play, RotateCcw, Table as TableIcon, FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { COMMODITIES, REGIONS } from "@geosignal/shared";

const POPULAR = [
  {
    title: "Houthi Red Sea attack → WTI Oil (24hr)",
    eventType: "Naval blockade",
    region: "middle-east",
    commodity: "USOIL",
    horizon: "24hr",
  },
  {
    title: "Russia sanctions announcement → EUR/USD (48hr)",
    eventType: "Sanctions announcement",
    region: "eastern-europe",
    commodity: "EURUSD",
    horizon: "48hr",
  },
  {
    title: "Black Sea grain corridor halt → Wheat (7d)",
    eventType: "Grain export halt",
    region: "eastern-europe",
    commodity: "WHEAT",
    horizon: "7d",
  },
] as const;

export default function BacktestingPage() {
  const [eventType, setEventType] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [commodity, setCommodity] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<"4hr" | "24hr" | "48hr" | "7d">(
    "24hr",
  );
  const [from, setFrom] = useState("2015-01-01");
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const run = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/backtesting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, region, commodity, horizon, from, to }),
      });
      if (!res.ok) throw new Error("Backtest failed");
      return (await res.json()) as {
        totalEvents: number;
        accuracyPct: number;
        avgMovePct: number;
        maxMovePct: number;
        minMovePct: number;
        rows: Array<{
          date: string;
          country: string;
          summary: string;
          movePct: number;
          correct: boolean;
        }>;
      };
    },
  });

  const canRun = Boolean(eventType && region && commodity && horizon);

  const results = run.data as
    | undefined
    | {
        totalEvents: number;
        accuracyPct: number;
        avgMovePct: number;
        maxMovePct: number;
        minMovePct: number;
        rows: Array<{
          date: string;
          country: string;
          summary: string;
          movePct: number;
          correct: boolean;
        }>;
      };

  const title = useMemo(() => {
    if (!results) return null;
    return `${eventType?.toUpperCase()} / ${region?.toUpperCase()} → ${commodity} (${horizon})`;
  }, [results, eventType, region, commodity, horizon]);

  return (
    <div className="p-8 h-full flex flex-col bg-app" style={{ backgroundColor: "#0e0e0e" }}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="mb-10 flex border-b pb-8" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
         <div className="flex-1">
            <div className="flex items-center gap-4 mb-2">
               <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Scenario Research</span>
               <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            </div>
            <h1 className="text-4xl font-black text-text-primary tracking-tighter">Backtesting Lab</h1>
         </div>
         <div className="flex items-center gap-3">
             <Button variant="outline" className="h-10 border-border text-[9px] font-black uppercase tracking-widest rounded-sm">
                <FileText size={14} className="mr-2" /> Export History
             </Button>
             <Button 
               disabled={!canRun || run.isPending}
               onClick={() => run.mutate()}
               className="h-10 px-8 bg-accent text-bg-app text-[9px] font-black uppercase tracking-widest rounded-sm shadow-[0_4px_15px_rgba(78,222,163,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
             >
                {run.isPending ? "SIMULATING..." : "RUN SIMULATION"}
             </Button>
         </div>
      </header>

      {/* ── Configuration Pane ─────────────────────────────────────── */}
      <section className="grid grid-cols-12 gap-6 mb-10">
         <div className="col-span-12 lg:col-span-8 p-6 rounded-lg bg-surface/30 border" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
            <div className="grid grid-cols-2 gap-6 mb-6">
               <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted ml-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Event Type</label>
                  <Input 
                    value={eventType ?? ""} 
                    onChange={e => setEventType(e.target.value)}
                    placeholder="E.G. NAVAL BLOCKADE"
                    className="bg-black/20 border-border h-11 text-[11px] font-bold tracking-widest rounded-sm placeholder:opacity-30"
                  />
               </div>
               <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted ml-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Asset Class</label>
                  <Select value={commodity || ""} onValueChange={setCommodity}>
                    <SelectTrigger className="bg-black/20 border-border h-11 text-[11px] font-bold uppercase tracking-widest rounded-sm">
                       <SelectValue placeholder="SELECT ASSET" />
                    </SelectTrigger>
                    <SelectContent>
                       {COMMODITIES.map(c => <SelectItem key={c.symbol} value={c.symbol} className="text-[10px] uppercase font-bold">{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
               </div>
            </div>
            
            <div className="grid grid-cols-3 gap-6">
               <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted ml-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Geographic Filter</label>
                  <Select value={region || ""} onValueChange={setRegion}>
                    <SelectTrigger className="bg-black/20 border-border h-11 text-[11px] font-bold uppercase tracking-widest rounded-sm">
                       <SelectValue placeholder="WORLDWIDE" />
                    </SelectTrigger>
                    <SelectContent>
                       {REGIONS.map(r => <SelectItem key={r.id} value={r.id} className="text-[10px] uppercase font-bold">{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
               </div>
               <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted ml-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Analysis Horizon</label>
                  <div className="flex bg-black/40 p-1 rounded-sm border border-border h-11">
                    {(["4hr", "24hr", "48hr", "7d"] as const).map((h) => (
                      <button
                        key={h}
                        onClick={() => setHorizon(h)}
                        className={`flex-1 text-[9px] font-black uppercase tracking-widest rounded-sm transition-all ${horizon === h ? 'bg-accent text-bg-app' : 'text-muted hover:text-white'}`}
                      >{h}</button>
                    ))}
                  </div>
               </div>
               <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted ml-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>History Window</label>
                  <div className="flex gap-2">
                     <Input value={from} onChange={e => setFrom(e.target.value)} className="bg-black/20 border-border h-11 text-[10px] font-mono text-center px-1" />
                     <div className="flex items-center text-muted">→</div>
                     <Input value={to} onChange={e => setTo(e.target.value)} className="bg-black/20 border-border h-11 text-[10px] font-mono text-center px-1" />
                  </div>
               </div>
            </div>
         </div>

         <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-muted ml-0.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Popular Simulations</h4>
            <div className="flex flex-col gap-3">
              {POPULAR.map((p) => (
                <div
                  key={p.title}
                  className="p-4 rounded-lg bg-surface/20 border border-border transition-all hover:bg-surface/40 hover:border-accent/40 cursor-pointer group"
                  onClick={() => {
                    setEventType(p.eventType);
                    setRegion(p.region);
                    setCommodity(p.commodity);
                    setHorizon(p.horizon);
                    setTimeout(() => run.mutate(), 0);
                  }}
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-primary group-hover:text-accent transition-colors leading-relaxed">
                    {p.title}
                  </p>
                </div>
              ))}
            </div>
         </div>
      </section>

      {/* ── Results Area ─────────────────────────────────────────── */}
      {results ? (
        <section className="flex-1 flex flex-col min-h-0">
           {/* Performance Metrics */}
           <div className="grid grid-cols-5 gap-6 mb-8">
              {[
                { label: "Detected Events", value: results.totalEvents, type: 'count' },
                { label: "Directional Accuracy", value: `${results.accuracyPct}%`, type: 'accuracy' },
                { label: "Mean Price Delta", value: `${results.avgMovePct}%`, type: 'delta' },
                { label: "Apex Movement", value: `${results.maxMovePct}%`, type: 'high' },
                { label: "Nadir Movement", value: `${results.minMovePct}%`, type: 'low' },
              ].map((m) => (
                <div key={m.label} className="p-6 rounded-lg bg-surface/30 border" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
                   <p className="text-[9px] font-black uppercase tracking-widest text-muted mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{m.label}</p>
                   <p className="text-3xl font-black font-mono tracking-tighter" style={{ color: "#e5e2e1" }}>{m.value}</p>
                </div>
              ))}
           </div>

           {/* Results Table */}
           <div className="flex-1 min-h-0 flex flex-col rounded-lg border overflow-hidden" style={{ borderColor: "rgba(72,72,72,0.15)", backgroundColor: "rgba(19, 19, 19, 0.4)" }}>
              <header className="p-5 border-b bg-black/20 flex justify-between items-center" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
                 <div className="flex items-center gap-4">
                    <TableIcon size={16} className="text-accent" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Raw Intelligence Log: {title}</span>
                 </div>
                 <Button variant="ghost" className="h-8 text-[9px] font-black uppercase tracking-widest text-muted hover:text-accent">
                    <Download size={12} className="mr-2" /> DATA.CSV
                 </Button>
              </header>

              <div className="flex-1 overflow-y-auto">
                 <table className="w-full text-left font-mono text-[11px]">
                    <thead className="sticky top-0 bg-black/60 backdrop-blur-md z-10 border-b" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
                       <tr>
                          <th className="p-4 uppercase text-muted font-black tracking-widest">Timestamp</th>
                          <th className="p-4 uppercase text-muted font-black tracking-widest">Geography</th>
                          <th className="p-4 uppercase text-muted font-black tracking-widest">Synthesis</th>
                          <th className="p-4 uppercase text-muted font-black tracking-widest text-right">Delta %</th>
                          <th className="p-4 uppercase text-muted font-black tracking-widest text-center">Status</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: "rgba(255,255,255,0.03)" }}>
                       {results.rows.map((r, idx) => (
                          <tr key={idx} className="hover:bg-white/5 transition-colors">
                             <td className="p-4 text-text-secondary">{r.date}</td>
                             <td className="p-4 font-bold text-text-primary uppercase tracking-tighter">{r.country}</td>
                             <td className="p-4 text-text-secondary opacity-80 leading-relaxed max-w-md truncate">{r.summary}</td>
                             <td className={`p-4 font-black text-right ${r.movePct >= 0 ? "text-price-up" : "text-price-down"}`}>
                                {r.movePct >= 0 ? "+" : ""}{r.movePct.toFixed(2)}%
                             </td>
                             <td className="p-4 text-center">
                                <span className={`px-2 py-0.5 rounded-sm text-[9px] font-black uppercase tracking-widest border ${r.correct ? "bg-accent/10 text-accent border-accent/20" : "bg-danger/10 text-danger border-danger/20"}`}>
                                   {r.correct ? "SUCCESS" : "NO_HIT"}
                                </span>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </section>
      ) : (
        <section className="flex-1 flex flex-col items-center justify-center opacity-30">
           <RotateCcw className="w-12 h-12 mb-6 animate-spin-slow" />
           <p className="text-[11px] font-black uppercase tracking-[0.5em]">System Idle: Ready for Simulation</p>
        </section>
      )}
    </div>
  );
}

