"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { COMMODITIES } from "@blue-beacon-research/shared";
import { SELECT_CLASSES } from "@/lib/utils";

type Price = {
  symbol: string;
  price: number;
  change_pct_24h?: number;
  changePct24h?: number;
};

/**
 * Real recent-price sparkline (replaces a previous Math.random() placeholder that
 * presented fabricated bars as a "LIVE VOLATILITY INDEX" — same pattern already
 * removed elsewhere in this product; not okay to leave in a paying trader's view).
 */
function PriceSparkline({ symbol, isUp }: { symbol: string; isUp: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["price-history", symbol],
    queryFn: async () => {
      const res = await fetch(`/api/prices/history?symbol=${encodeURIComponent(symbol)}`);
      const json = (await res.json()) as { points: { price: number; fetchedAt: string }[] };
      return json.points ?? [];
    },
    staleTime: 60_000,
  });

  const points = (data ?? []).map((p) => p.price);

  if (isLoading) {
    return (
      <p className="text-[9px] font-mono text-on-surface-variant/50 uppercase tracking-[0.2em] text-center">
        Loading history…
      </p>
    );
  }

  if (points.length < 2) {
    return (
      <p className="text-[9px] font-mono text-on-surface-variant/50 uppercase tracking-[0.2em] text-center leading-relaxed">
        Not enough price history yet for a trend view
      </p>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  return (
    <>
      <div className="absolute inset-x-6 top-6 bottom-12 flex items-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
        {points.map((price, i) => {
          const h = 15 + ((price - min) / range) * 85;
          return (
            <div
              key={i}
              className={`flex-1 rounded-t-sm transition-all duration-500 ${isUp ? "bg-primary/20" : "bg-error/20"}`}
              style={{ height: `${h}%` }}
            >
              <div
                className={`w-full h-full rounded-t-sm transition-all duration-700 ${isUp ? "bg-primary/40 group-hover:bg-primary" : "bg-error/40 group-hover:bg-error"}`}
                style={{ opacity: 0.3 + (i / points.length) * 0.7 }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-[9px] font-mono text-on-surface-variant uppercase tracking-[0.2em] text-center mt-4 font-bold border-t border-outline-variant/10 pt-4">
        Recent price trend
      </p>
    </>
  );
}

export function WatchlistClient() {
  const router = useRouter();
  const params = useSearchParams();
  const preselect = params.get("symbol");
  const [watch, setWatch] = useState<string[]>(() =>
    preselect ? [preselect] : ["USOIL", "XAUUSD"],
  );
  const [addSymbol, setAddSymbol] = useState<string>("SELECT COMMODITY");

  const { data, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["prices"],
    queryFn: async () => {
      const res = await fetch("/api/prices");
      const json = (await res.json()) as { prices: Price[] };
      return json;
    },
    refetchInterval: 15_000,
  });

  const lastFetchAt = dataUpdatedAt || null;

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, Price>();
    for (const p of data?.prices ?? []) map.set(p.symbol, p);
    return map;
  }, [data?.prices]);

  const available = COMMODITIES.filter((c) => !watch.includes(c.symbol));

  const handleAdd = () => {
    if (addSymbol === "SELECT COMMODITY") return;
    if (addSymbol === "__ALL__") {
      setWatch((p) => [...new Set([...p, ...available.map((c) => c.symbol)])]);
    } else {
      setWatch((p) => [...new Set([...p, addSymbol])]);
    }
    setAddSymbol("SELECT COMMODITY");
  };

  const handleRemove = (sym: string) => {
    setWatch((w) => w.filter((x) => x !== sym));
  };

  return (
    <div className="fixed inset-0 left-[256px] right-[260px] top-16 bg-surface-container-lowest overflow-y-auto p-10">
      <div className="max-w-[1440px] mx-auto">
        {/* Page Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1 h-6 bg-primary"></div>
              <p className="font-label text-xs text-primary tracking-[0.3em] uppercase">
                Asset Monitoring
              </p>
            </div>
            <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface">
              Commodity Watchlist
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <select
                aria-label="Add commodity to watchlist"
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value)}
                className={`w-[220px] ${SELECT_CLASSES}`}
              >
                <option disabled value="SELECT COMMODITY">
                  SELECT COMMODITY
                </option>
                {available.length > 1 && (
                  <option value="__ALL__">
                    Select All ({available.length} remaining)
                  </option>
                )}
                {available.map((c) => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                keyboard_arrow_down
              </span>
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
              <div
                key={sym}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/watchlist/${encodeURIComponent(sym)}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/watchlist/${encodeURIComponent(sym)}`);
                  }
                }}
                className="bg-surface-container/40 border border-outline-variant/30 rounded-xl overflow-hidden group hover:border-primary/50 transition-colors cursor-pointer"
              >
                {/* Top section (darker) */}
                <div className="p-6 bg-black/40">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className="bg-surface-container-high px-2 py-0.5 rounded-sm font-label text-[9px] text-on-surface-variant tracking-widest mb-2 inline-block uppercase">
                        {meta?.category ?? "MARKET"}
                      </span>
                      <h3 className="text-xl font-headline font-bold text-on-surface">
                        {meta?.label || sym}
                      </h3>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(sym);
                      }}
                      className="text-on-surface-variant hover:text-error transition-colors p-1"
                    >
                      <span className="material-symbols-outlined text-lg">
                        close
                      </span>
                    </button>
                  </div>
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-3xl font-bold text-on-surface tracking-tighter">
                      {p
                        ? Number(p.price).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </span>
                    <span
                      className={`font-mono text-sm flex items-center font-bold ${isUp ? "text-primary" : "text-error"}`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {isUp ? "arrow_drop_up" : "arrow_drop_down"}
                      </span>
                      {Math.abs(pct).toFixed(2)}%
                    </span>
                  </div>
                </div>
                {/* Bottom section (Sparkline) */}
                <div className="p-6 bg-surface-container/20 relative min-h-[140px] flex flex-col justify-end">
                  <PriceSparkline symbol={sym} isUp={isUp} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Dashboard Analytics Section */}
        <div className="grid grid-cols-12 gap-6 mt-12 mb-12">
          {/* Secondary Data Insights */}
          <div className="col-span-12 lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex-1 bg-surface-container rounded-xl p-6 border border-outline-variant/10 shadow-xl group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded bg-surface-variant/50 flex items-center justify-center border border-outline-variant/20">
                  <span className="material-symbols-outlined text-on-surface-variant text-lg">
                    insights
                  </span>
                </div>
                <h4 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase">
                  Market Signal Forecast
                </h4>
              </div>
              <p className="text-sm font-body leading-relaxed text-on-surface/80 mb-6 italic border-l-2 border-outline-variant/20 pl-4 font-medium">
                Predictions have been removed from this view. To avoid
                displaying unauthenticated or fabricated model outputs, this
                feature will be restored once a validated prediction pipeline is
                available.
              </p>
            </div>

            <div className="flex-1 bg-surface-container rounded-xl p-6 border border-outline-variant/10 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded bg-surface-variant/50 flex items-center justify-center border border-outline-variant/20">
                  <span
                    className="material-symbols-outlined text-on-surface-variant text-lg"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    update
                  </span>
                </div>
                <h4 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase">
                  Watchlist Sync
                </h4>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="font-mono text-3xl text-on-surface font-bold tracking-tighter">
                    {lastFetchAt
                      ? `${Math.floor((Date.now() - lastFetchAt) / 1000)}s`
                      : "--"}
                  </p>
                  <p className="font-label text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">
                    Time since last update
                  </p>
                </div>
                <button
                  onClick={() => refetch()}
                  className="text-primary hover:text-primary-container font-label text-[10px] uppercase tracking-widest font-bold transition-colors cursor-pointer"
                >
                  Force Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Floating Action */}
      <button
        onClick={() => {
          const el = document.querySelector("select");
          if (el) {
            el.scrollIntoView({ behavior: "smooth" });
            el.focus();
          }
        }}
        className="fixed bottom-8 right-[292px] w-14 h-14 bg-primary text-black rounded-full shadow-[0_0_30px_rgba(111,251,190,0.4)] flex items-center justify-center group z-50 transition-all hover:scale-110 active:scale-95 shadow-lg cursor-pointer"
      >
        <span className="material-symbols-outlined text-3xl group-hover:rotate-90 transition-transform duration-500">
          add
        </span>
        <div className="absolute right-full mr-4 px-4 py-2 bg-surface-container border border-outline-variant/30 rounded-lg shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap backdrop-blur-md">
          <span className="label text-[10px] tracking-[0.2em] text-on-surface font-black uppercase">
            Initialize New Monitor
          </span>
        </div>
      </button>
    </div>
  );
}
