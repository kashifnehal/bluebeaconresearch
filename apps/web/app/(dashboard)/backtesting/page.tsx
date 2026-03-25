"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { COMMODITIES, REGIONS } from "@blue-beacon-research/shared";

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
  {
    title: "Iran vessel seizure → Brent Crude (24hr)",
    eventType: "Vessel Seizure",
    region: "middle-east",
    commodity: "BRENT",
    horizon: "24hr",
  },
  {
    title: "Ukraine escalation → Natural Gas (48hr)",
    eventType: "Infrastructure Strike",
    region: "eastern-europe",
    commodity: "NATGAS",
    horizon: "48hr",
  },
  {
    title: "Sudan coup → Gold (24hr)",
    eventType: "Coup d'état",
    region: "africa",
    commodity: "XAUUSD",
    horizon: "24hr",
  },
] as const;

export default function BacktestingPage() {
  const [eventType, setEventType] = useState<string>("");
  const [region, setRegion] = useState<string>("middle-east");
  const [commodity, setCommodity] = useState<string>("USOIL");
  const [horizon, setHorizon] = useState<"4hr" | "24hr" | "48hr" | "7d">("24hr");
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

  const results = run.data;

  return (
    <main className="fixed inset-0 left-[256px] right-[260px] top-16 bg-surface-container-lowest overflow-y-auto p-10">
      <div className="max-w-[1440px] mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-6 bg-primary"></div>
            <p className="font-label text-xs text-primary tracking-[0.3em] uppercase">Scenario Research</p>
          </div>
          <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface">Backtesting Lab</h1>
          <p className="text-on-surface-variant max-w-2xl mt-2 font-medium">
            Analyze historical market volatility markers and validate predictive models against real-world geopolitical events.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-8 mb-12">
          {/* Left Column: Popular Backtests */}
          <section className="col-span-12 lg:col-span-5 space-y-4">
            <h3 className="font-label text-[#4EDEA3] text-[10px] font-black tracking-[0.2em] uppercase">Popular Simulations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {POPULAR.map((p) => (
                <div 
                  key={p.title}
                  onClick={() => {
                    setEventType(p.eventType);
                    setRegion(p.region);
                    setCommodity(p.commodity);
                    setHorizon(p.horizon);
                    setTimeout(() => run.mutate(), 50);
                  }}
                  className="bg-surface-container/40 p-4 border border-outline-variant/10 hover:border-primary/50 transition-all cursor-pointer group rounded-lg"
                >
                  <p className="text-sm font-bold text-on-surface mb-2 leading-tight group-hover:text-primary transition-colors">{p.title}</p>
                  <p className="text-[9px] font-label text-on-surface-variant tracking-widest uppercase group-hover:text-primary/70">Initialize Simulation</p>
                </div>
              ))}
            </div>
          </section>

          {/* Right Column: Engine Viz */}
          <div className="col-span-12 lg:col-span-7">
            <div className="relative h-full min-h-[300px] w-full bg-surface-container rounded-xl overflow-hidden border border-outline-variant/10 group">
              <img 
                className="w-full h-full object-cover opacity-20 grayscale group-hover:scale-110 transition-transform duration-[20s] ease-linear" 
                alt="Engine Viz"
                src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2000"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
              <div className="absolute bottom-6 left-6">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                  <span className="font-label text-[10px] text-primary tracking-widest uppercase font-bold">Active Historical Engine</span>
                </div>
                <h4 className="text-2xl font-bold font-mono text-on-surface">GENESIS-X_V4</h4>
                <p className="text-[10px] text-on-surface-variant font-mono uppercase tracking-widest mt-1">Processing 15 years of geo-political volatility markers</p>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Backtest Form */}
        <section className="mb-12">
          <div className="bg-surface-container/60 p-8 border-l-4 border-primary rounded-r-xl shadow-2xl backdrop-blur-sm">
            <h3 className="font-label text-[10px] font-black text-on-surface-variant mb-8 flex items-center gap-2 tracking-[0.3em] uppercase">
              <span className="material-symbols-outlined text-sm">settings_input_component</span> Configure Simulation Parameters
            </h3>
            <div className="flex flex-wrap items-end gap-8">
              <div className="flex-1 min-w-[240px]">
                <label className="block font-label text-[10px] text-on-surface-variant mb-2 font-bold tracking-widest uppercase">Event Type</label>
                <input 
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full bg-transparent border-b border-outline-variant focus:border-primary text-sm text-on-surface py-2.5 px-1 focus:ring-0 transition-all font-mono outline-none" 
                  placeholder="e.g. Coup, Blockade, Sanction" 
                  type="text"
                />
              </div>
              <div className="w-[180px]">
                <label className="block font-label text-[10px] text-on-surface-variant mb-2 font-bold tracking-widest uppercase">Region</label>
                <select 
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full bg-transparent border-b border-outline-variant focus:border-primary text-sm text-on-surface py-2.5 px-0 focus:ring-0 transition-all font-label uppercase appearance-none outline-none cursor-pointer"
                >
                  {REGIONS.map(r => <option key={r.id} value={r.id} className="bg-surface-container text-on-surface">{r.label}</option>)}
                </select>
              </div>
              <div className="w-[180px]">
                <label className="block font-label text-[10px] text-on-surface-variant mb-2 font-bold tracking-widest uppercase">Commodity</label>
                <select 
                  value={commodity}
                  onChange={(e) => setCommodity(e.target.value)}
                  className="w-full bg-transparent border-b border-outline-variant focus:border-primary text-sm text-on-surface py-2.5 px-0 focus:ring-0 transition-all font-label uppercase appearance-none outline-none cursor-pointer"
                >
                  {COMMODITIES.map(c => <option key={c.symbol} value={c.symbol} className="bg-surface-container text-on-surface">{c.label}</option>)}
                </select>
              </div>
              <div className="min-w-[200px]">
                <label className="block font-label text-[10px] text-on-surface-variant mb-2 font-bold tracking-widest uppercase">Analysis Horizon</label>
                <div className="flex bg-black/40 p-1 rounded-lg border border-outline-variant/30">
                  {(["4hr", "24hr", "48hr", "7d"] as const).map((h) => (
                    <button 
                      key={h}
                      onClick={() => setHorizon(h)}
                      className={`flex-1 px-4 py-1.5 text-[10px] font-black font-label rounded-md transition-all ${horizon === h ? 'bg-primary text-black' : 'text-on-surface-variant hover:text-on-surface'}`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => run.mutate()}
                disabled={!eventType || run.isPending}
                className="bg-primary hover:bg-primary-container text-black px-10 py-3.5 rounded-lg font-bold font-label text-sm flex items-center gap-2 transition-all shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg">{run.isPending ? 'sync' : 'play_arrow'}</span>
                {run.isPending ? 'SIMULATING...' : 'RUN BACKTEST'}
              </button>
            </div>
          </div>
        </section>

        {/* Results Metadata */}
        {results && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {[
                { label: "TOTAL EVENTS", value: results.totalEvents, color: "text-on-surface" },
                { label: "ACCURACY RATE", value: `${results.accuracyPct}%`, color: "text-primary" },
                { label: "AVG MOVE %", value: `${results.avgMovePct}%`, color: "text-on-surface" },
                { label: "MAX DEVIATION", value: `${results.maxMovePct}%`, color: "text-primary" },
                { label: "MIN DEVIATION", value: `${results.minMovePct}%`, color: "text-on-surface" },
              ].map((stat) => (
                <div key={stat.label} className="bg-surface-container/40 p-6 border border-outline-variant/10 rounded-xl group hover:border-primary/30 transition-colors">
                  <p className="font-label text-[9px] text-on-surface-variant mb-2 font-bold tracking-[0.2em] uppercase">{stat.label}</p>
                  <p className={`text-2xl font-mono ${stat.color} font-extrabold tracking-tighter`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Results Table */}
            <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-outline-variant/10 bg-black/20">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>history</span>
                  <h4 className="font-label text-xs font-bold text-on-surface tracking-widest uppercase">Historical Event Trace</h4>
                </div>
                <button className="flex items-center gap-2 text-[10px] font-label font-bold text-on-surface-variant hover:text-primary transition-colors tracking-widest uppercase">
                  <span className="material-symbols-outlined text-sm">download</span> Download Audit Log
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-black/40 border-b border-outline-variant/10">
                    <tr>
                      <th className="px-6 py-4 font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">Timestamp</th>
                      <th className="px-6 py-4 font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">Geography</th>
                      <th className="px-6 py-4 font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">Synthesis</th>
                      <th className="px-6 py-4 font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">Delta %</th>
                      <th className="px-6 py-4 font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-widest text-center">Prediction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/5">
                    {results.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-surface-bright/30 transition-colors group">
                        <td className="px-6 py-4 font-mono text-xs text-on-surface-variant">{row.date}</td>
                        <td className="px-6 py-4 font-label text-xs font-bold text-on-surface uppercase tracking-tight">{row.country}</td>
                        <td className="px-6 py-4 text-xs text-on-surface/70 leading-relaxed font-medium">{row.summary}</td>
                        <td className={`px-6 py-4 font-mono text-xs font-bold ${row.movePct >= 0 ? 'text-primary' : 'text-error'}`}>
                          {row.movePct >= 0 ? '+' : ''}{row.movePct.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`material-symbols-outlined text-xl ${row.correct ? 'text-primary' : 'text-error'}`} style={{ fontVariationSettings: row.correct ? "'FILL' 1" : "" }}>
                            {row.correct ? 'check_circle' : 'cancel'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!results && !run.isPending && (
          <div className="flex flex-col items-center justify-center py-32 opacity-20 group">
            <span className="material-symbols-outlined text-6xl mb-6 group-hover:rotate-180 transition-transform duration-1000">history</span>
            <p className="font-label text-[11px] font-black uppercase tracking-[0.5em] text-on-surface">System Idle: Ready for Simulation</p>
          </div>
        )}
      </div>

      {/* Footer / System Integrity */}
      <footer className="mt-auto pt-10 border-t border-outline-variant/10 flex justify-between items-center text-[10px] font-mono text-on-surface-variant/30 uppercase tracking-[0.2em] font-bold">
        <div>BLUE BEACON RESEARCH SYSTEM HASH: 88F9-AX21-KL88</div>
        <div className="flex gap-8">
          <span>LATENCY: 12ms</span>
          <span>DATA INTEGRITY: 100% Verified</span>
        </div>
      </footer>
    </main>
  );
}
