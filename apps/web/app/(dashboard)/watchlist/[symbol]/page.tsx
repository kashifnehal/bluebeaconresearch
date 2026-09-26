"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
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
import { COMMODITIES, FOREX_PAIRS } from "@blue-beacon-research/shared";
import type { Signal } from "@blue-beacon-research/shared";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { Pagination } from "@/components/ui/Pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { useMyPreferences } from "@/hooks/useMyPreferences";
import { safeFormatDistanceToNow } from "@/lib/utils";
import { logUsageEvent } from "@/lib/funnel-events";
import { isHintSeen, markHintSeen } from "@/lib/feature-hints";
import type { Direction } from "@blue-beacon-research/shared";

const CHART_ATTRIBUTION_HINT_ID = "chart_attribution";
// A point's own day-over-day move is classified "volatile" rather than up/down
// once it crosses this threshold — mirrors the language signals already use for
// commodity_impacts.direction, so the attribution query's direction match means
// the same thing on both sides.
const VOLATILITY_THRESHOLD_PCT = 3;

type AttributionResult = { id: string; title: string; eventDate: string; hoursBefore: number };

type Price = {
  symbol: string;
  price: number;
  change_pct_24h?: number;
  changePct24h?: number;
};

type PricePoint = { price: number; fetchedAt: string };

const HISTORY_DAYS = 90;
// Correlated-signals list page size. 20 matches what /api/signals returned by
// default before pagination, so page 1 of this list is byte-identical to today.
const SIGNALS_PAGE_SIZE = 20;

type ChartRangeId = "1M" | "6M" | "1Y" | "3Y" | "5Y";
const CHART_RANGES = [
  // 90-day `commodity_prices` series — 1M fits inside that window.
  { id: "1M" as const, label: "1M", source: "db" as const, days: 30 },
  // Longer ranges are sliced from the existing Yahoo weekly-bars 5y fetch.
  { id: "6M" as const, label: "6M", source: "yahoo" as const, days: 183 },
  { id: "1Y" as const, label: "1Y", source: "yahoo" as const, days: 365 },
  { id: "3Y" as const, label: "3Y", source: "yahoo" as const, days: 365 * 3 },
  { id: "5Y" as const, label: "5Y", source: "yahoo" as const, days: null },
] as const;

function slicePointsToDays(
  points: PricePoint[],
  days: number | null,
): PricePoint[] {
  if (days == null) return points;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return points.filter((p) => new Date(p.fetchedAt).getTime() >= cutoff);
}

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

function directionAtIndex(
  chartData: { t: number; price: number }[],
  index: number,
): Direction {
  const cur = chartData[index]?.price;
  const prevIndex = index > 0 ? index - 1 : index + 1;
  const prev = chartData[prevIndex]?.price;
  if (cur == null || prev == null || prev === 0) return "up";
  const pctChange = ((cur - prev) / prev) * 100;
  if (Math.abs(pctChange) >= VOLATILITY_THRESHOLD_PCT) return "volatile";
  return pctChange >= 0 ? "up" : "down";
}

export default function WatchlistSymbolPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol || "").toUpperCase();
  // Resolve the symbol against commodities first, then forex pairs (#87) — a
  // followed forex pair (e.g. EURUSD) otherwise falls through to its raw code
  // and never matches signals, since forex impacts live in a separate column.
  const forexMeta = FOREX_PAIRS.find((f) => f.symbol === symbol);
  const meta = COMMODITIES.find((c) => c.symbol === symbol) ?? forexMeta;
  const isForex = Boolean(forexMeta);
  const { data: myPrefs } = useMyPreferences();
  const isFollowed = Boolean(
    myPrefs?.commodities.includes(symbol) ||
      myPrefs?.forexPairs.includes(symbol),
  );

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
  const [chartRange, setChartRange] = useState<ChartRangeId>("1M");
  const activeRange =
    CHART_RANGES.find((r) => r.id === chartRange) ?? CHART_RANGES[0];

  type History5y = {
    points: PricePoint[];
    incomplete: boolean;
    availableFrom: string | null;
  };
  const { data: history5y, isLoading: history5yLoading } = useQuery({
    queryKey: ["price-history-5y", symbol],
    queryFn: async () => {
      const res = await fetch(
        `/api/prices/history-5y?symbol=${encodeURIComponent(symbol)}`,
      );
      const json = (await res.json()) as History5y;
      return {
        points: json.points ?? [],
        incomplete: Boolean(json.incomplete),
        availableFrom: json.availableFrom ?? null,
      };
    },
    staleTime: 15 * 60 * 1000,
  });
  const history5yPoints = history5y?.points ?? [];

  const [signalsPage, setSignalsPage] = useState(1);
  const [attributionPoint, setAttributionPoint] = useState<{ t: number; price: number } | null>(null);
  // Different commodity → back to page 1. React's documented "adjust state when a
  // prop changes during render" pattern (store the last-seen symbol in state),
  // which avoids both an effect round-trip and a ref write during render.
  const [trackedSymbol, setTrackedSymbol] = useState(symbol);
  if (trackedSymbol !== symbol) {
    setTrackedSymbol(symbol);
    setSignalsPage(1);
    setChartRange("1M");
    setAttributionPoint(null);
  }

  const {
    data: signalsData,
    isLoading: signalsLoading,
    isPlaceholderData: signalsIsPlaceholder,
  } = useQuery({
    queryKey: ["commodity-signals", symbol, signalsPage],
    queryFn: async () => {
      const res = await fetch(
        `/api/signals?${isForex ? "forexPair" : "commodity"}=${encodeURIComponent(symbol)}&window=${HISTORY_DAYS}d&sort=newest&limit=${SIGNALS_PAGE_SIZE}&page=${signalsPage}`,
      );
      const json = (await res.json()) as { signals?: Signal[]; total?: number };
      return { signals: json.signals ?? [], total: json.total ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
  const events = signalsData?.signals ?? [];
  const signalsTotal = signalsData?.total ?? 0;
  const signalsPageCount = Math.max(
    1,
    Math.ceil(signalsTotal / SIGNALS_PAGE_SIZE),
  );

  // watchlist_symbol_viewed — behavioral instrumentation (research doc claude/64).
  // One row per distinct symbol per page-session; entity-deduped on `symbol` so a
  // strict-mode double-mount or a re-render doesn't double-log, but navigating
  // between two drill-downs still records both.
  useEffect(() => {
    logUsageEvent("watchlist_symbol_viewed", { symbol, is_forex: isForex }, "entity");
  }, [symbol, isForex]);

  // #207/#228 chart attribution — "why did this happen" (Phase 1: DB-only, no
  // external news fallback yet). First-use explanatory copy follows the same
  // localStorage-seen-once convention as lib/feature-hints.ts's other hints.
  const [showAttributionHint, setShowAttributionHint] = useState(false);
  useEffect(() => {
    setShowAttributionHint(!isHintSeen(CHART_ATTRIBUTION_HINT_ID));
  }, []);

  const [attributionResults, setAttributionResults] = useState<AttributionResult[] | null>(null);
  const [attributionLoading, setAttributionLoading] = useState(false);
  const [attributionError, setAttributionError] = useState(false);

  async function handleChartPointClick(index: number) {
    if (showAttributionHint) {
      markHintSeen(CHART_ATTRIBUTION_HINT_ID);
      setShowAttributionHint(false);
    }
    const point = chartData[index];
    if (!point) return;
    setAttributionPoint(point);
    setAttributionResults(null);
    setAttributionError(false);
    setAttributionLoading(true);
    try {
      const direction = directionAtIndex(chartData, index);
      const res = await fetch(
        `/api/signals/attribution?asset=${encodeURIComponent(symbol)}&timestamp=${encodeURIComponent(new Date(point.t).toISOString())}&direction=${direction}`,
      );
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = (await res.json()) as { results?: AttributionResult[] };
      setAttributionResults(json.results ?? []);
    } catch (err) {
      console.warn("[watchlist-symbol] chart attribution fetch failed:", err);
      setAttributionError(true);
    } finally {
      setAttributionLoading(false);
    }
  }

  const chartData = useMemo(() => {
    const source = activeRange.source === "db" ? points : history5yPoints;
    return slicePointsToDays(source, activeRange.days).map((p) => ({
      t: new Date(p.fetchedAt).getTime(),
      price: p.price,
    }));
  }, [activeRange, points, history5yPoints]);

  const chartDomain: [number, number] | null = chartData.length
    ? [chartData[0].t, chartData[chartData.length - 1].t]
    : null;

  const chartLoading =
    activeRange.source === "db" ? historyLoading : history5yLoading;
  const isFiveYearRange = activeRange.id === "5Y";
  const showYahooIncomplete =
    isFiveYearRange &&
    Boolean(history5y?.incomplete) &&
    Boolean(history5y?.availableFrom) &&
    chartData.length >= 2;
  const useLongAxisTicks =
    activeRange.source === "yahoo" && activeRange.id !== "6M";

  return (
    <div className="mt-16 md:mt-0 md:fixed md:inset-0 md:left-[256px] md:right-0 md:top-16 bg-surface-container-lowest overflow-y-auto p-4 md:p-10">
      <div className="max-w-[1440px] mx-auto">
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Watchlist", href: "/watchlist" },
            { label: meta?.label || symbol },
          ]}
          className="mb-6"
        />

        {/* Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1 h-6 bg-primary"></div>
              <p className="font-label text-xs text-primary tracking-[0.3em] uppercase">
                {meta?.category ?? "Market"} · Drill-Down
              </p>
              {isFollowed && (
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-sm font-label text-[12px] md:text-[9px] font-bold tracking-widest uppercase border border-primary/50 bg-primary/10 text-primary"
                  title="One of the assets you follow"
                >
                  <span className="material-symbols-outlined text-[12px]">star</span>
                  You follow this
                </span>
              )}
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

        {/* Single price chart + range selector (replaces the fixed 90-day chart
            and the separate 5-year Yahoo panel). 1M reads the 90-day DB series;
            6M/1Y/3Y/5Y slice the existing Yahoo weekly-bars fetch. */}
        <div className="bg-surface-container/40 border border-outline-variant/30 rounded-xl p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase">
              Price History
            </h2>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Price history range"
              data-testid="watchlist-chart-ranges"
            >
              {CHART_RANGES.map((range) => {
                const selected = range.id === chartRange;
                return (
                  <button
                    key={range.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setChartRange(range.id)}
                    className="px-3 py-1 rounded-sm font-label text-[12px] md:text-[10px] font-bold tracking-widest uppercase border transition-colors cursor-pointer inline-flex items-center min-h-[44px] md:min-h-0"
                    style={{
                      backgroundColor: selected ? "#4edea3" : "transparent",
                      color: selected ? "#003824" : "#bbcac0",
                      borderColor: selected ? "#4edea3" : "#3c4a42",
                    }}
                  >
                    {range.label}
                  </button>
                );
              })}
            </div>
          </div>
          {showYahooIncomplete && history5y?.availableFrom && (
            <p className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/70 uppercase tracking-widest mb-4">
              Showing available history from{" "}
              {new Date(history5y.availableFrom).toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}{" "}
              — Yahoo does not have a full 5-year series for this symbol.
            </p>
          )}
          {showAttributionHint && !chartLoading && chartData.length >= 2 && (
            <p className="mb-3 flex items-center gap-1.5 text-[12px] md:text-[10px] font-mono text-primary/80 uppercase tracking-widest">
              <span className="material-symbols-outlined text-sm">info</span>
              Hover or tap a point to see what may have driven this move
            </p>
          )}
          {chartLoading ? (
            <Skeleton className="h-[340px] w-full rounded-lg" data-testid="price-chart-skeleton" />
          ) : chartData.length < 2 ? (
            <p className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center py-20">
              {isFiveYearRange
                ? "Not enough 5-year price history available for this symbol"
                : "Not enough price history yet for a chart view"}
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
                      useLongAxisTicks
                        ? new Date(t).toLocaleDateString(undefined, {
                            month: "short",
                            year: "numeric",
                          })
                        : new Date(t).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
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
                    labelFormatter={(t) =>
                      useLongAxisTicks
                        ? new Date(t as number).toLocaleDateString(undefined, {
                            month: "short",
                            year: "numeric",
                          })
                        : new Date(t as number).toLocaleString()
                    }
                    formatter={(v) => [typeof v === "number" ? v.toFixed(2) : String(v), "Price"]}
                    contentStyle={{
                      background: "#141414",
                      border: "1px solid rgba(255,255,255,0.1)",
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#6ffbbe"
                    strokeWidth={2}
                    dot={false}
                    activeDot={(dotProps: { cx?: number; cy?: number; index?: number }) => {
                      const { cx, cy, index } = dotProps;
                      return (
                        <g key={`attribution-dot-${index}`}>
                          <circle cx={cx} cy={cy} r={5} fill="#6ffbbe" stroke="#003824" strokeWidth={1} />
                          <circle
                            data-testid="chart-attribution-trigger"
                            cx={cx}
                            cy={cy}
                            r={16}
                            fill="transparent"
                            style={{ cursor: "pointer" }}
                            onClick={() => index !== undefined && handleChartPointClick(index)}
                          />
                        </g>
                      );
                    }}
                  />
                  {activeRange.source === "db" &&
                    chartDomain &&
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
          <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant uppercase tracking-widest text-center mt-4">
            {activeRange.source === "db"
              ? "Dashed lines mark geopolitical signals below. Informational only — not a trading recommendation."
              : "Weekly closes from Yahoo Finance. Informational only — not a trading recommendation."}
          </p>

          {attributionPoint && (
            <div className="mt-4 pt-4 border-t border-outline-variant/20">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-label text-[11px] font-bold tracking-widest text-on-surface uppercase">
                  Why did this move happen?
                </h3>
                <button
                  type="button"
                  onClick={() => setAttributionPoint(null)}
                  aria-label="Close"
                  className="text-on-surface-variant hover:text-on-surface min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
              {attributionLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full rounded-lg" />
                </div>
              ) : attributionError ? (
                <p className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest">
                  Could not load related events for this point right now.
                </p>
              ) : attributionResults && attributionResults.length > 0 ? (
                <div className="space-y-2">
                  {attributionResults.map((r) => (
                    <a
                      key={r.id}
                      href={`/events/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="chart-attribution-result"
                      className="block p-3 rounded-lg bg-black/20 border border-outline-variant/20 hover:border-primary/40 transition-colors"
                    >
                      <span className="block text-sm font-bold text-on-surface leading-snug">{r.title}</span>
                      <span className="block text-[12px] md:text-[10px] font-mono text-on-surface-variant uppercase tracking-widest mt-1">
                        {r.hoursBefore} hour{r.hoursBefore === 1 ? "" : "s"} before this move
                      </span>
                    </a>
                  ))}
                  <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant/70 uppercase tracking-widest pt-1">
                    Time-window observation only — not a claim that this event caused the move.
                  </p>
                </div>
              ) : (
                <p className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest">
                  No clearly related event found in BBR&apos;s tracked history for this window.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Correlated events timeline */}
        <div className="bg-surface-container/40 border border-outline-variant/30 rounded-xl p-6 mb-10">
          <h2 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase mb-6">
            Correlated Signals — Last {HISTORY_DAYS} Days
          </h2>
          {signalsLoading ? (
            <div className="space-y-3" data-testid="signals-list-skeleton">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : events.length === 0 && signalsPage === 1 ? (
            <p className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center py-10">
              No signals flagged {symbol} impact in the last {HISTORY_DAYS} days
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => {
                const impact = isForex
                  ? ev.currencyPairImpacts?.find((c) => c.asset === symbol)
                  : ev.commodityImpacts.find((c) => c.asset === symbol);
                const move = computeEventPriceMove(points, ev.eventDate ?? ev.createdAt);
                return (
                  <a
                    key={ev.id}
                    href={`/events/${ev.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-left p-4 rounded-lg bg-black/20 border border-outline-variant/20 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <span className="text-sm font-bold text-on-surface leading-snug">{ev.title}</span>
                      {impact && (
                        <CommodityChip asset={impact.asset} direction={impact.direction} confidence={impact.confidence} />
                      )}
                    </div>
                    <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant uppercase tracking-widest mb-2">
                      {ev.country} · {safeFormatDistanceToNow(ev.eventDate ?? ev.createdAt, { addSuffix: true })} ·
                      Severity {ev.severity}
                    </p>
                    <p className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/80">
                      {move.status === "too-recent" &&
                        "Signaled less than an hour ago — not enough time has passed to measure a price move yet."}
                      {move.status === "insufficient-data" &&
                        "Not enough price history around this signal to measure a move."}
                      {move.status === "ok" &&
                        `Price moved ${move.pct >= 0 ? "+" : ""}${move.pct.toFixed(2)}% in the ${move.windowHours}h following this signal ($${move.baselinePrice.toFixed(2)} → $${move.targetPrice.toFixed(2)}).`}
                    </p>
                  </a>
                );
              })}
            </div>
          )}
          <Pagination
            page={signalsPage}
            pageCount={signalsPageCount}
            onPageChange={setSignalsPage}
            disabled={signalsIsPlaceholder}
          />
        </div>
      </div>
    </div>
  );
}
