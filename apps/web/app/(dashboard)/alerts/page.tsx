"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Signal } from "@geosignal/shared";
import { formatDistanceToNowStrict } from "date-fns";

export default function AlertsPage() {
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  const { data } = useQuery({
    queryKey: ["signals", "feed"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      return (await res.json()) as { signals: Signal[] };
    },
    refetchInterval: 30_000,
  });

  const signals = data?.signals ?? [];
  
  const filteredSignals = useMemo(() => {
    if (filter === "all") return signals;
    if (filter === "high") return signals.filter(s => s.severity >= 8);
    if (filter === "medium") return signals.filter(s => s.severity >= 4 && s.severity < 8);
    return signals.filter(s => s.severity < 4);
  }, [signals, filter]);

  const featuredSignal = signals.find(s => s.severity >= 8) || signals[0];
  const secondarySignal = signals.find(s => s.id !== featuredSignal?.id) || signals[1];
  const tableSignals = filteredSignals.slice(0, 8);

  return (
    <main className="ml-[256px] mr-[260px] mt-16 p-8 min-h-screen bg-surface-container-lowest text-on-surface">
      {/* Header Section */}
      <section className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter font-headline">Intelligence Feed</h1>
          <p className="text-on-surface/60 mt-2 font-body font-medium">Real-time global signal monitoring and risk assessment.</p>
        </div>
        <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant/10">
          <button className="px-6 py-2 bg-primary-container text-on-primary-container text-xs label font-bold rounded-md uppercase tracking-wider">All Signals</button>
          <button className="px-6 py-2 text-on-surface/60 text-xs label font-bold uppercase tracking-wider hover:text-on-surface transition-colors">Watchlist</button>
          <button className="px-6 py-2 text-on-surface/60 text-xs label font-bold uppercase tracking-wider hover:text-on-surface transition-colors">Archives</button>
        </div>
      </section>

      {/* Filters Bar */}
      <section className="flex justify-between items-center py-4 border-y border-outline-variant/20 mb-8">
        <div className="flex items-center gap-6">
          <span className="label text-[10px] tracking-widest text-on-surface/40 font-bold uppercase">Severity:</span>
          <div className="flex gap-2">
            <button 
              onClick={() => setFilter("all")}
              className={`px-3 py-1 text-[10px] label font-bold rounded-sm uppercase transition-all ${filter === 'all' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-variant text-on-surface-variant hover:bg-surface-bright'}`}
            >GLOBAL</button>
            <button 
              onClick={() => setFilter("high")}
              className={`px-3 py-1 text-[10px] label font-bold rounded-sm uppercase transition-all ${filter === 'high' ? 'bg-error-container text-on-error-container' : 'bg-error-container/20 text-error-container hover:bg-error-container/40'}`}
            >HIGH</button>
            <button 
              onClick={() => setFilter("medium")}
              className={`px-3 py-1 text-[10px] label font-bold rounded-sm uppercase transition-all ${filter === 'medium' ? 'bg-[#ffb340]/40 text-[#ffb340]' : 'bg-[#ffb340]/10 text-[#ffb340] hover:bg-[#ffb340]/20'}`}
            >MEDIUM</button>
            <button 
              onClick={() => setFilter("low")}
              className={`px-3 py-1 text-[10px] label font-bold rounded-sm uppercase transition-all ${filter === 'low' ? 'bg-primary-container/40 text-primary-container' : 'bg-primary-container/10 text-primary-container hover:bg-primary-container/20'}`}
            >LOW</button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 label text-xs text-on-surface/60 font-medium">
            <span>Sector:</span>
            <button className="flex items-center gap-1 text-on-surface hover:text-primary transition-colors">Energy <span className="material-symbols-outlined text-xs">expand_more</span></button>
          </div>
          <div className="h-4 w-px bg-outline-variant/30"></div>
          <div className="flex items-center gap-2 label text-xs text-on-surface/60 font-medium">
            <span>Timeframe:</span>
            <button className="flex items-center gap-1 text-on-surface hover:text-primary transition-colors">Last 24 Hours <span className="material-symbols-outlined text-xs">expand_more</span></button>
          </div>
        </div>
      </section>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-6 pb-24">
        {/* Featured Critical Card (8-col) */}
        <div className="col-span-8 bg-surface-container rounded-lg overflow-hidden flex flex-col relative border border-outline-variant/10 shadow-xl group">
          <div className="absolute top-0 left-0 w-full h-1 bg-error"></div>
          <div className="p-8 flex-1">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-on-error-container/10 rounded-full flex items-center justify-center border border-on-error-container/20">
                  <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                </div>
                <div>
                  <span className="label text-[10px] text-error font-bold tracking-[0.2em] uppercase">Critical System Anomaly</span>
                  <h2 className="text-2xl font-bold font-headline mt-1 text-on-surface line-clamp-1">{featuredSignal?.title || "No Peak Anomaly Detected"}</h2>
                </div>
              </div>
              <div className="text-right">
                <div className="mono text-[10px] text-on-surface/40 uppercase tracking-widest font-bold">
                  {featuredSignal ? formatDistanceToNowStrict(new Date(featuredSignal.createdAt)) + " ago" : "STANDBY"}
                </div>
                <div className="mono text-sm text-error font-bold mt-1">
                  {featuredSignal ? `SEVERITY ${featuredSignal.severity}.0` : "LEVEL NOMINAL"}
                </div>
              </div>
            </div>
            <div className="relative h-72 rounded-md overflow-hidden mb-6 border border-outline-variant/20">
              <img 
                alt="Grid Data Map" 
                className="w-full h-full object-cover grayscale brightness-50 group-hover:scale-105 transition-transform duration-700" 
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1200"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container to-transparent opacity-80"></div>
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                <div className="space-y-1">
                  <p className="label text-[10px] uppercase text-on-surface/60 font-bold tracking-widest">Detected Origin</p>
                  <p className="mono text-xs font-bold text-on-surface">{featuredSignal?.country || "GLOBAL MESH"}</p>
                </div>
                <div className="bg-surface-container-high/80 backdrop-blur-md border border-outline-variant p-3 rounded flex gap-4">
                  <div className="text-center">
                    <p className="label text-[9px] text-on-surface/40 uppercase font-bold">Confidence</p>
                    <p className="mono text-sm font-bold text-primary">94.2%</p>
                  </div>
                  <div className="w-px h-8 bg-outline-variant/30"></div>
                  <div className="text-center">
                    <p className="label text-[9px] text-on-surface/40 uppercase font-bold">Latency</p>
                    <p className="mono text-sm font-bold text-on-surface">12ms</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm font-body text-on-surface/80 leading-relaxed mb-6 font-medium">
              {featuredSignal?.summary || "System nodes are currently operating within expected parameters. No priority interventions required."}
            </p>
          </div>
          <div className="bg-surface-container-high/50 p-4 border-t border-outline-variant/10 flex justify-between items-center">
            <p className="text-xs font-body text-on-surface/60 font-medium italic">Automated sentinel intervention recommended. Escalation protocol Alpha-9 initiated.</p>
            <button className="bg-error-container text-on-error-container px-6 py-2.5 label text-[10px] font-bold tracking-widest uppercase hover:brightness-110 active:scale-95 transition-all shadow-lg rounded-sm">Deploy Countermeasures</button>
          </div>
        </div>

        {/* Secondary Card (4-col) */}
        <div className="col-span-4 bg-surface-container rounded-lg p-6 border border-outline-variant/10 shadow-xl flex flex-col relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary/40"></div>
          <div className="flex justify-between items-center mb-6">
            <span className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] label font-bold tracking-[0.2em] rounded-sm uppercase border border-primary/20">Escalating</span>
            <span className="mono text-[10px] text-on-surface/40 font-bold">#SIG-{(secondarySignal?.id || "NUL").slice(-4).toUpperCase()}</span>
          </div>
          <h3 className="text-lg font-bold font-headline leading-tight mb-6 text-on-surface group-hover:text-primary transition-colors">
            {secondarySignal?.title || "Awaiting Secondary Signal..."}
          </h3>
          <div className="space-y-6 flex-1">
            <div className="space-y-2">
              <div className="flex justify-between items-center label text-[10px] tracking-widest text-on-surface/40 font-bold uppercase">
                <span>Grid Frequency</span>
                <span className="mono text-on-surface font-bold">59.98 Hz</span>
              </div>
              <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
                <div className="h-full bg-primary w-3/4"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center label text-[10px] tracking-widest text-on-surface/40 font-bold uppercase">
                <span>Price Impact</span>
                <span className="mono text-primary font-bold">+$4.20/BBL</span>
              </div>
              <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
                <div className="h-full bg-primary w-1/2"></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center label text-[10px] tracking-widest text-on-surface/40 font-bold uppercase">
                <span>Downlink Sync</span>
                <span className="mono text-on-surface font-bold">NOMINAL</span>
              </div>
              <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[90%]"></div>
              </div>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t border-outline-variant/10">
            <div className="flex -space-x-1 mb-4">
              {['JD', 'AI', 'ML'].map((initials, i) => (
                <div key={i} className={`w-6 h-6 rounded-full border border-surface-container flex items-center justify-center text-[8px] font-bold ${initials === 'AI' ? 'bg-primary text-bg-app' : 'bg-surface-container-highest text-on-surface'}`}>
                  {initials}
                </div>
              ))}
            </div>
            <p className="text-[10px] font-body text-on-surface/40 leading-relaxed italic font-medium">
              "Observing abnormal grouping patterns in AIS data. Probability of coordinated slowdown high." - <span className="text-primary font-bold">Sentinel AI</span>
            </p>
          </div>
        </div>

        {/* Signal Velocity Chart (4-col, bottom) */}
        <div className="col-span-4 bg-surface-container rounded-lg p-6 border border-outline-variant/10 shadow-xl flex flex-col group">
          <div className="flex justify-between items-center mb-8">
            <span className="label text-[10px] tracking-widest text-on-surface/40 uppercase font-bold">Signal Velocity</span>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              <span className="mono text-[10px] text-primary font-bold">7-Day Trend</span>
            </div>
          </div>
          <div className="flex-1 flex items-end justify-between gap-1.5 px-2">
            {[40, 60, 55, 85, 70, 95, 100].map((h, i) => (
              <div key={i} className="flex-1 bg-primary/10 rounded-t-sm relative group/bar transition-all duration-500 hover:bg-primary/30 cursor-pointer" style={{ height: `${h}%` }}>
                <div className={`absolute inset-0 bg-primary transition-opacity duration-300 ${i === 6 ? 'opacity-100' : 'opacity-20 group-hover/bar:opacity-50'}`}></div>
                {i === 6 && <div className="absolute top-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_10px_#4edea3]"></div>}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 label text-[9px] text-on-surface/30 tracking-widest font-bold">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span className="text-primary font-bold">NOW</span>
          </div>
        </div>

        {/* Geospatial Intelligence Stream Table (8-col, bottom) */}
        <div className="col-span-8 bg-surface-container rounded-lg overflow-hidden flex flex-col border border-outline-variant/10 shadow-xl">
          <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container/30">
            <h3 className="label text-xs font-bold tracking-widest text-on-surface/60 uppercase">Geospatial Intelligence Stream</h3>
            <div className="flex gap-4">
              <button className="material-symbols-outlined text-on-surface/40 hover:text-primary transition-colors text-sm">search</button>
              <button className="material-symbols-outlined text-on-surface/40 hover:text-primary transition-colors text-sm">more_vert</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody className="divide-y divide-outline-variant/10">
                {tableSignals.length > 0 ? tableSignals.map((signal) => {
                  const isHigh = signal.severity >= 8;
                  const isMedium = signal.severity >= 4 && signal.severity < 8;
                  
                  return (
                    <tr key={signal.id} className="hover:bg-surface-bright/20 transition-all group cursor-pointer border-l-2 border-transparent hover:border-primary">
                      <td className="px-6 py-4 w-4">
                        <div className={`w-2 h-2 rounded-full ${isHigh ? 'bg-error pulse-red' : (isMedium ? 'bg-[#ffb340]' : 'bg-primary-container')}`}></div>
                      </td>
                      <td className="px-2 py-4 mono text-[10px] text-on-surface/40 whitespace-nowrap font-bold">
                        {new Date(signal.createdAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 font-headline text-sm font-bold text-on-surface line-clamp-1 group-hover:text-primary transition-colors">
                        {signal.title}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={`px-2 py-0.5 border text-[8px] label font-bold uppercase tracking-widest rounded-sm ${isHigh ? 'bg-error-container/20 border-error/50 text-error' : (isMedium ? 'bg-[#ffb340]/10 border-[#ffb340]/50 text-[#ffb340]' : 'bg-primary-container/10 border-primary-container/50 text-primary-container')}`}>
                          {isHigh ? 'CRITICAL' : (isMedium ? 'HIGH' : 'NOTICE')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="material-symbols-outlined text-on-surface/20 group-hover:text-primary group-hover:translate-x-1 transition-all text-sm">chevron_right</span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="p-12 text-center opacity-30">
                       <div className="flex flex-col items-center gap-3">
                         <span className="material-symbols-outlined animate-spin text-2xl">sync</span>
                         <span className="label text-[10px] tracking-widest uppercase font-bold">Resyncing Node Feed...</span>
                       </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-auto p-4 border-t border-outline-variant/10 text-center bg-surface-container/10">
            <button className="label text-[10px] text-on-surface/40 hover:text-primary transition-colors uppercase tracking-[0.2em] font-bold">Load More Active Signals</button>
          </div>
        </div>
      </div>

      {/* Sentinel FAB */}
      <button className="fixed bottom-12 right-[292px] w-14 h-14 bg-primary text-on-primary rounded-lg shadow-[0_0_25px_rgba(111,251,190,0.3)] flex items-center justify-center group hover:scale-105 active:scale-95 transition-all z-50 animate-bounce hover:animate-none">
        <span className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>add_alert</span>
        <div className="absolute right-full mr-4 px-4 py-2 bg-surface-container border border-outline-variant/30 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap backdrop-blur-md">
          <span className="label text-[10px] tracking-[0.2em] text-on-surface font-black uppercase">Configure Sentinel Rule</span>
        </div>
      </button>

      <style jsx>{`
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;  
          overflow: hidden;
        }
      `}</style>
    </main>
  );
}

