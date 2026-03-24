"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, X, Search, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [addSymbol, setAddSymbol] = useState<string | null>(null);

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

  return (
    <div className="p-8 h-full flex flex-col" style={{ backgroundColor: "#0e0e0e" }}>
      {/* ── Watchlist Header ────────────────────────────────────────── */}
      <header className="mb-10 flex border-b pb-8" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
         <div className="flex-1">
            <div className="flex items-center gap-4 mb-2">
               <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Asset Monitoring</span>
               <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            </div>
            <h1 className="text-4xl font-black text-text-primary tracking-tighter">Tactical Watchlist</h1>
         </div>
         
         <div className="flex items-center gap-3">
             <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
                <input 
                  placeholder="SEARCH ASSETS..."
                  className="bg-surface border h-10 px-10 rounded-sm text-[10px] font-bold tracking-widest outline-none focus:border-accent transition-all w-[300px]"
                  style={{ borderColor: "rgba(72,72,72,0.15)", color: "#e5e2e1" }}
                />
             </div>
             <Select value={addSymbol || ""} onValueChange={(v) => setAddSymbol(v)}>
               <SelectTrigger className="h-10 w-[180px] bg-surface border-border text-[9px] font-black uppercase tracking-widest rounded-sm">
                 <SelectValue placeholder="ADD TO WATCH" />
               </SelectTrigger>
               <SelectContent className="bg-surface border-border">
                 {available.map((c) => (
                   <SelectItem key={c.symbol} value={c.symbol} className="text-[10px] uppercase font-bold text-text-secondary focus:bg-accent focus:text-bg-app">
                     {c.label} ({c.symbol})
                   </SelectItem>
                 ))}
               </SelectContent>
             </Select>
             <Button
               className="h-10 px-6 bg-accent hover:scale-[1.02] active:scale-[0.98] text-bg-app text-[9px] font-black uppercase tracking-widest rounded-sm shadow-[0_4px_15px_rgba(78,222,163,0.3)]"
               onClick={() => {
                 if (!addSymbol) return;
                 setWatch((p) => [...p, addSymbol]);
                 setAddSymbol(null);
               }}
             >
               Confirm Access
             </Button>
         </div>
      </header>

      {/* ── Asset Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {watch.map((sym) => {
          const meta = COMMODITIES.find((c) => c.symbol === sym);
          const p = priceBySymbol.get(sym);
          const pct = p ? (p.change_pct_24h ?? p.changePct24h ?? 0) : 0;
          const isUp = pct >= 0;
          const volatility = (Math.random() * 20 + 30).toFixed(1);
          const sentiment = (Math.random() * 40 + 60).toFixed(0);

          return (
            <div
              key={sym}
              className="bg-surface/40 border group hover:border-accent/40 transition-all duration-300 rounded-sm flex flex-col p-6 cursor-pointer relative"
              style={{ borderColor: "rgba(72,72,72,0.15)" }}
            >
              <div className="flex justify-between items-start mb-8">
                 <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-mono text-muted uppercase tracking-widest">{meta?.category ?? "MARKET"}</span>
                    <h3 className="text-xl font-black text-text-primary tracking-tight group-hover:text-accent transition-colors">{sym}</h3>
                 </div>
                 <button 
                   onClick={(e) => { e.stopPropagation(); setWatch((w) => w.filter((x) => x !== sym)); }}
                   className="text-muted hover:text-danger p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                 >
                   <X size={14} />
                 </button>
              </div>

              <div className="flex justify-between items-end mb-10">
                 <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Price Index</span>
                    <span className="text-3xl font-black text-text-primary font-mono tracking-tighter">
                      {p ? Number(p.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—"}
                    </span>
                 </div>
                 <div className="text-right">
                    <span className="text-[9px] font-bold uppercase text-muted block mb-1">24H DELTA</span>
                    <span className={`text-sm font-black font-mono ${isUp ? "text-price-up" : "text-price-down"}`}>
                      {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
                    </span>
                 </div>
              </div>

              {/* Ticker Detail Grid */}
              <div className="grid grid-cols-2 gap-4 border-t pt-6" style={{ borderColor: "rgba(72,72,72,0.15)" }}>
                 <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted uppercase tracking-widest">Volatility</span>
                    <div className="flex items-center gap-2">
                       <span className="text-xs font-black text-text-secondary">{volatility}%</span>
                       <div className="h-1 bg-white/10 flex-1 rounded-full overflow-hidden">
                          <div className={`h-full ${Number(volatility) > 40 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${volatility}%` }} />
                       </div>
                    </div>
                 </div>
                 <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-muted uppercase tracking-widest">Sentiment</span>
                    <div className="flex items-center gap-2">
                       <span className="text-xs font-black text-text-secondary">{sentiment}%</span>
                       <div className="h-1 bg-white/10 flex-1 rounded-full overflow-hidden">
                          <div className="h-full bg-accent" style={{ width: `${sentiment}%` }} />
                       </div>
                    </div>
                 </div>
              </div>

              {/* Sparkline Mockup */}
              <div className="mt-8 h-12 flex items-end justify-between gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                 {[40, 60, 35, 75, 50, 85, 45, 90, 65, 100, 70, 80].map((h, i) => (
                    <div 
                      key={i} 
                      className={`flex-1 rounded-t-[1px] ${isUp ? 'bg-accent' : 'bg-danger'}`} 
                      style={{ height: `${20 + (Math.random() * 80)}%`, opacity: 0.3 + (i / 12) * 0.7 }} 
                    />
                 ))}
              </div>
            </div>
          );
        })}

        {/* Empty State / Add Card */}
        <div 
          className="border border-dashed rounded-sm flex flex-col items-center justify-center p-8 cursor-pointer hover:border-accent/40 hover:bg-accent/5 transition-all text-muted hover:text-accent group"
          style={{ borderColor: "rgba(72,72,72,0.15)" }}
        >
           <Plus className="w-8 h-8 mb-4 group-hover:scale-110 transition-transform" />
           <span className="text-[10px] font-black uppercase tracking-[0.4em]">Initialize New Monitor</span>
        </div>
      </div>
    </div>
  );
}


