"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { COMMODITIES } from "@blue-beacon-research/shared";
import type { Signal } from "@blue-beacon-research/shared";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { safeFormatDistanceToNow } from "@/lib/utils";

type Price = {
  symbol: string;
  price: number;
  change_pct_24h?: number;
  changePct24h?: number;
};

type PricePoint = { price: number; fetchedAt: string };

const HISTORY_DAYS = 90;

function findAtOrBefore(points: PricePoint[], iso: string): PricePoint | null {
  const t = new Date(iso).getTime();
  let result: PricePoint | null = null;
  for (const p of points) {
    if (new Date(p.fetchedAt).getTime() <= t) result = p;
    else break;
  }
  return result;
}

/**
 * Strictly factual, backward-looking price-move stat for a signal — no predictive
 * or buy/sell framing (hard product rule, see docs/claude_project/10_DECISIONS.md).
 * Uses whatever real price history is available; reports "not enough data" rather
 * than estimating one.
 */
function computeEventPriceMove(points: PricePoint[], eventIso: string) {
  const eventT = new Date(eventIso).getTime();
  const elapsedHours = (Date.now() - eventT) / 3_600_000;
  if (elapsedHours < 1) return { status: "too-recent" as const };

  const windowHours = Math.min(24, Math.floor(elapsedHours));
  const baseline = findAtOrBefore(points, eventIso);
  const targetIso = new Date(eventT + windowHours * 3_600_000).toISOString();
  const target = findAtOrBefore(points, targetIso);

  if (!baseline || !target || baseline.fetchedAt === target.fetchedAt) {
    return { status: "insufficient-data" as const };
  }

  const pct = ((target.price - baseline.price) / baseline.price) * 100;
  return {
    status: "ok" as const,
    pct,
    windowHours,
    baselinePrice: baseline.price,
    targetPrice: target.price,
  };
}

export default function WatchlistSymbolPage() {
  const params = useParams<{ symbol: string }>();
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol || "").toUpperCase();
  const meta = COMMODITIES.find((c) => c.symbol === symbol);

  const { data: pricesData } = useQuery({
    queryKey: ["prices"],
    queryFn: async () => {
      const res = await fetch("/api/prices");
      const json = (await res.json()) as { prices: Price[] };
      return json;
    },
  });
  const price = pricesData?.prices.find((p) => p.symbol === symbol);
  const pct = price ? (price.change_pct_24h ?? price.changePct24h ?? 0) : 0;

  const { data: historyPoints, isLoading: historyLoading } = useQuery({
    queryKey: ["price-history", symbol, HISTORY_DAYS],
    queryFn: async () => {
      const res = await fetch(
        `/api/prices/history?symbol=${encodeURIComponent(symbol)}&days=${HISTORY_DAYS}`,
      );
      const json = (await res.json()) as { points: PricePoint[] };
      return json.points ?? [];
    },
  });
  const points = historyPoints ?? [];

  const { data: signalsData, isLoading: signalsLoading } = useQuery({
    queryKey: ["commodity-signals", symbol],
    queryFn: async () => {
      const res = await fetch(
        `/api/signals?commodity=${encodeURIComponent(symbol)}&window=${HISTORY_DAYS}d&sort=newest`,
      );
      const json = (await res.json()) as { signals: Signal[] };
      return json.signals ?? [];
    },
  });
  const events = signalsData ?? [];

  const chartData = useMemo(
    () => points.map((p) => ({ t: new Date(p.fetchedAt).getTime(), price: p.price })),
    [points],
  );

  const chartDomain: [number, number] | null = chartData.length
    ? [chartData[0].t, chartData[chartData.length - 1].t]
    : null;

  return (
    <div className="fixed inset-0 left-[256px] right-[260px] top-16 bg-surface-container-lowest overflow-y-auto p-10">
      <div className="max-w-[1440px] mx-auto">
        {/* Breadcrumb */}
        <button
          onClick={() => router.push("/watchlist")}
          className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors mb-6"
        >
          <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">
            chevron_left
          </span>
          Back to Watchlist
        </button>

        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1 h-6 bg-primary"></div>
              <p className="font-label text-xs text-primary tracking-[0.3em] uppercase">
                {meta?.category ?? "Market"} · Drill-Down
              </p>
            </div>
            <h1 className="text-4xl font-headline font-extrabold tracking-tight text-on-surface">
              {meta?.label || symbol}
            </h1>
            <p className="font-mono text-xs text-on-surface-variant mt-1">{symbol}</p>
          </div>
          <div className="flex items-baseline gap-4">
            <span className="font-mono text-3xl font-bold text-on-surface tracking-tighter">
              {price
                ? Number(price.price).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </span>
            <span
              className={`font-mono text-sm flex items-center font-bold ${pct >= 0 ? "text-primary" : "text-error"}`}
            >
              <span className="material-symbols-outlined text-sm">
                {pct >= 0 ? "arrow_drop_up" : "arrow_drop_down"}
              </span>
              {Math.abs(pct).toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Price chart */}
        <div className="bg-surface-container/40 border border-outline-variant/30 rounded-xl p-6 mb-8">
          <h4 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase mb-6">
            Price History — Last {HISTORY_DAYS} Days
          </h4>
          {historyLoading ? (
            <p className="text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center py-20">
              Loading price history…
            </p>
          ) : chartData.length < 2 ? (
            <p className="text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center py-20">
              Not enough price history yet for a chart view
            </p>
          ) : (
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={chartDomain ?? ["dataMin", "dataMax"]}
                    tickFormatter={(t) =>
                      new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    }
                    stroke="rgba(255,255,255,0.3)"
                    tick={{ fontSize: 10, fontFamily: "monospace" }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    stroke="rgba(255,255,255,0.3)"
                    tick={{ fontSize: 10, fontFamily: "monospace" }}
                    width={70}
                  />
                  <Tooltip
                    labelFormatter={(t) => new Date(t as number).toLocaleString()}
                    formatter={(v) => [typeof v === "number" ? v.toFixed(2) : String(v), "Price"]}
                    contentStyle={{
                      background: "#141414",
                      border: "1px solid rgba(255,255,255,0.1)",
                      fontSize: 11,
                    }}
                  />
                  <Line type="monotone" dataKey="price" stroke="#6ffbbe" strokeWidth={2} dot={false} />
                  {chartDomain &&
                    events.map((ev) => {
                      const iso = ev.eventDate ?? ev.createdAt;
                      const t = new Date(iso).getTime();
                      if (t < chartDomain[0] || t > chartDomain[1]) return null;
                      return (
                        <ReferenceLine key={ev.id} x={t} stroke="rgba(255,255,255,0.35)" strokeDasharray="2 4" />
                      );
                    })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[9px] font-mono text-on-surface-variant/50 uppercase tracking-widest text-center mt-4">
            Dashed lines mark geopolitical signals below. Informational only — not a trading recommendation.
          </p>
        </div>

        {/* Correlated events timeline */}
        <div className="bg-surface-container/40 border border-outline-variant/30 rounded-xl p-6 mb-10">
          <h4 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase mb-6">
            Correlated Signals — Last {HISTORY_DAYS} Days
          </h4>
          {signalsLoading ? (
            <p className="text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center py-10">
              Loading signals…
            </p>
          ) : events.length === 0 ? (
            <p className="text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center py-10">
              No signals flagged {symbol} impact in the last {HISTORY_DAYS} days
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => {
                const impact = ev.commodityImpacts.find((c) => c.asset === symbol);
                const move = computeEventPriceMove(points, ev.eventDate ?? ev.createdAt);
                return (
                  <button
                    key={ev.id}
                    onClick={() => router.push(`/events/${ev.id}`)}
                    className="w-full text-left p-4 rounded-lg bg-black/20 border border-outline-variant/20 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <span className="text-sm font-bold text-on-surface leading-snug">{ev.title}</span>
                      {impact && (
                        <CommodityChip asset={impact.asset} direction={impact.direction} confidence={impact.confidence} />
                      )}
                    </div>
                    <p className="text-[9px] font-mono text-on-surface-variant uppercase tracking-widest mb-2">
                      {ev.country} · {safeFormatDistanceToNow(ev.eventDate ?? ev.createdAt, { addSuffix: true })} ·
                      Severity {ev.severity}
                    </p>
                    <p className="text-[10px] font-mono text-on-surface-variant/80">
                      {move.status === "too-recent" &&
                        "Signaled less than an hour ago — not enough time has passed to measure a price move yet."}
                      {move.status === "insufficient-data" &&
                        "Not enough price history around this signal to measure a move."}
                      {move.status === "ok" &&
                        `Price moved ${move.pct >= 0 ? "+" : ""}${move.pct.toFixed(2)}% in the ${move.windowHours}h following this signal ($${move.baselinePrice.toFixed(2)} → $${move.targetPrice.toFixed(2)}).`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
