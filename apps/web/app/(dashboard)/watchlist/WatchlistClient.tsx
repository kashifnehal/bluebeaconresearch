"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { COMMODITIES } from "@geosignal/shared";

type Price = {
  symbol: string;
  price: number;
  change_pct_24h?: number;
  changePct24h?: number;
};

export function WatchlistClient() {
  const params = useSearchParams();
  const preselect = params.get("symbol");
  const [watch, setWatch] = useState<string[]>(() =>
    preselect ? [preselect] : ["USOIL", "XAUUSD", "BTCUSD", "EURUSD"],
  );
  const [addSymbol, setAddSymbol] = useState<string>("SELECT COMMODITY");

  const { data } = useQuery({
    queryKey: ["prices"],
    queryFn: async () => {
      const res = await fetch("/api/prices");
      return (await res.json()) as { prices: Price[] };
    },
    refetchInterval: 15_000,
  });

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, Price>();
    for (const p of data?.prices ?? []) map.set(p.symbol, p);
    return map;
  }, [data?.prices]);

  const available = COMMODITIES.filter((c) => !watch.includes(c.symbol));

  const handleAdd = () => {
    if (addSymbol === "SELECT COMMODITY") return;
    setWatch((p) => [...new Set([...p, addSymbol])]);
    setAddSymbol("SELECT COMMODITY");
  };

  const handleRemove = (sym: string) => {
    setWatch((w) => w.filter((x) => x !== sym));
  };

  return (
    <main className="fixed inset-0 left-[256px] right-[260px] top-16 bg-surface-container-lowest overflow-y-auto p-10">
      <div className="max-w-[1440px] mx-auto">
        {/* Page Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1 h-6 bg-primary"></div>
              <p className="font-label text-xs text-primary tracking-[0.3em] uppercase">Asset Monitoring</p>
            </div>
            <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface">Commodity Watchlist</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <select 
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value)}
                className="w-[220px] bg-surface-container-high border-b border-outline-variant text-on-surface font-mono text-xs py-2.5 px-4 appearance-none focus:border-primary outline-none cursor-pointer"
              >
                <option disabled value="SELECT COMMODITY">SELECT COMMODITY</option>
                {available.map(c => (
                  <option key={c.symbol} value={c.symbol}>{c.label}</option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">keyboard_arrow_down</span>
            </div>
            <button 
              onClick={handleAdd}
              className="bg-gradient-to-br from-primary to-primary-container px-6 py-2.5 rounded-lg text-black font-label font-bold text-sm tracking-tight flex items-center gap-2 hover:opacity-90 transition-opacity active:scale-95 shadow-lg shadow-primary/10"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              ADD ASSET
            </button>
          </div>
        </div>

        {/* Commodity Cards Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {watch.map((sym) => {
            const meta = COMMODITIES.find((c) => c.symbol === sym);
            const p = priceBySymbol.get(sym);
            const pct = p ? (p.change_pct_24h ?? p.changePct24h ?? 0) : 0;
            const isUp = pct >= 0;

            return (
              <div key={sym} className="bg-surface-container/40 border border-outline-variant/30 rounded-xl overflow-hidden group hover:border-primary/50 transition-colors">
                {/* Top section (darker) */}
                <div className="p-6 bg-black/40">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="bg-surface-container-high px-2 py-0.5 rounded-sm font-label text-[9px] text-on-surface-variant tracking-widest mb-2 inline-block uppercase">
                        {meta?.category ?? "MARKET"}
                      </span>
                      <h3 className="text-xl font-headline font-bold text-on-surface">{meta?.label || sym}</h3>
                    </div>
                    <button 
                      onClick={() => handleRemove(sym)}
                      className="text-on-surface-variant hover:text-error transition-colors p-1"
                    >
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-3xl font-bold text-on-surface tracking-tighter">
                      {p ? Number(p.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                    </span>
                    <span className={`font-mono text-sm flex items-center font-bold ${isUp ? 'text-primary' : 'text-error'}`}>
                      <span className="material-symbols-outlined text-sm">{isUp ? 'arrow_drop_up' : 'arrow_drop_down'}</span> 
                      {Math.abs(pct).toFixed(2)}%
                    </span>
                  </div>
                </div>
                {/* Bottom section (Sparkline) */}
                <div className="p-6 bg-surface-container/20 relative min-h-[140px] flex flex-col justify-end">
                  <div className="absolute inset-x-6 top-6 bottom-12 flex items-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                    {Array.from({ length: 12 }).map((_, i) => {
                      const h = 20 + Math.random() * 80;
                      return (
                        <div 
                          key={i} 
                          className={`flex-1 rounded-t-sm transition-all duration-500 ${isUp ? 'bg-primary/20' : 'bg-error/20'}`} 
                          style={{ height: `${h}%` }}
                        >
                          <div 
                            className={`w-full h-full rounded-t-sm transition-all duration-700 ${isUp ? 'bg-primary/40 group-hover:bg-primary' : 'bg-error/40 group-hover:bg-error'}`}
                            style={{ opacity: 0.3 + (i / 12) * 0.7 }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[9px] font-mono text-on-surface-variant uppercase tracking-[0.2em] text-center mt-4 font-bold border-t border-outline-variant/10 pt-4">
                    LIVE VOLATILITY INDEX
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dashboard Analytics Section (Bento Grid) */}
        <div className="grid grid-cols-12 gap-6 mt-12 mb-12">
          {/* Large Geo Map Overlay */}
          <div className="col-span-12 lg:col-span-8 h-[400px] bg-surface-container rounded-xl relative overflow-hidden group border border-outline-variant/10">
            <img 
              className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-1000 grayscale brightness-75 contrast-125" 
              alt="Geospatial Heatmap"
              src="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=2000"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
            
            {/* Floating Glass UI */}
            <div className="absolute top-6 left-6 backdrop-blur-xl bg-surface/60 p-5 border border-outline-variant/30 rounded-lg shadow-2xl">
              <p className="font-label text-[10px] text-primary tracking-[0.3em] mb-1 font-bold">GEOSPATIAL DRILLDOWN</p>
              <h4 className="font-headline font-bold text-white uppercase tracking-tight text-lg">Supply Chain Nodes</h4>
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_#4edea3]"></div>
                  <span className="font-mono text-xs text-on-surface font-bold tracking-tight">NODE-04: ACTIVE MESH</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-error shadow-[0_0_8px_#ffb4ab]"></div>
                  <span className="font-mono text-xs text-on-surface font-bold tracking-tight">NODE-11: DISRUPTED FLOW</span>
                </div>
              </div>
            </div>

            <div className="absolute bottom-6 right-6 flex gap-3">
              <button className="w-10 h-10 rounded bg-black/60 border border-outline-variant/30 flex items-center justify-center hover:bg-primary/20 transition-colors text-on-surface backdrop-blur-md">
                <span className="material-symbols-outlined">add</span>
              </button>
              <button className="w-10 h-10 rounded bg-black/60 border border-outline-variant/30 flex items-center justify-center hover:bg-primary/20 transition-colors text-on-surface backdrop-blur-md">
                <span className="material-symbols-outlined">remove</span>
              </button>
            </div>
          </div>

          {/* Secondary Data Insights */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
            <div className="flex-1 bg-surface-container rounded-xl p-6 border border-outline-variant/10 shadow-xl group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center border border-primary/20">
                  <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>
                </div>
                <h4 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase">AI Prediction</h4>
              </div>
              <p className="text-sm font-body leading-relaxed text-on-surface/80 mb-6 italic border-l-2 border-primary/40 pl-4 font-medium">
                "WTI Crude expected to test 80.00 psychological level within next 48h based on regional port delays."
              </p>
              <div className="flex justify-between items-center mb-2">
                <span className="font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">Confidence Rating</span>
                <span className="font-mono text-sm text-primary font-extrabold">89.4%</span>
              </div>
              <div className="w-full h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                <div className="h-full bg-primary shadow-[0_0_10px_#4edea3]" style={{ width: '89.4%' }}></div>
              </div>
            </div>

            <div className="flex-1 bg-surface-container rounded-xl p-6 border border-outline-variant/10 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded bg-surface-variant/50 flex items-center justify-center border border-outline-variant/20">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>update</span>
                </div>
                <h4 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase">Watchlist Sync</h4>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-mono text-3xl text-on-surface font-bold tracking-tighter">32s</p>
                  <p className="font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">Time since last update</p>
                </div>
                <button className="text-primary hover:text-primary-container font-label text-[10px] uppercase tracking-widest font-bold transition-colors">Force Refresh</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Floating Action */}
      <button className="fixed bottom-8 right-[292px] w-14 h-14 bg-primary text-black rounded-full shadow-[0_0_30px_rgba(111,251,190,0.4)] flex items-center justify-center group z-50 transition-all hover:scale-110 active:scale-95 shadow-lg">
        <span className="material-symbols-outlined text-3xl group-hover:rotate-90 transition-transform duration-500">add</span>
        <div className="absolute right-full mr-4 px-4 py-2 bg-surface-container border border-outline-variant/30 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap backdrop-blur-md">
          <span className="label text-[10px] tracking-[0.2em] text-on-surface font-black uppercase">Initialize New Monitor</span>
        </div>
      </button>
    </main>
  );
}
