"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { EventCategory } from "@blue-beacon-research/shared";
import { EVENT_CATEGORY_LABELS } from "@/lib/market-impact-assessment";
import {
  shouldShowUncategorizedNote,
  partitionCategoryCounts,
  isAllUncategorized,
  orderSeriesKeys,
  UNCATEGORIZED_KEY,
  OTHER_KEY,
} from "@/lib/driver-breakdown";
import { Skeleton } from "@/components/ui/skeleton";

type BucketKey = EventCategory | typeof UNCATEGORIZED_KEY | typeof OTHER_KEY;

type Row = { date: string; category: string; count: number };

// Dataviz skill categorical palette, dark-mode steps (validated against this
// app's #141414 chart surface — see command output in the PR that added this
// file). Never cycled/generated: a real 9th event_category or the
// "uncategorized" bucket past the 8th slot folds into "other" below rather
// than getting a made-up hue.
const CATEGORY_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
];
// "Uncategorized" is missing classification data, not a market-driver
// category — kept visually distinct (muted gray, outside the 8-hue
// categorical set) from the other slot's real-but-small categories.
const UNCATEGORIZED_COLOR = "#898781";
const OTHER_LABEL = "Other";
// Real EventCategory values beyond the top-7 (by count, in the selected
// window) fold into a single "Other" series using the 8th palette slot,
// rather than generating a 9th/10th hue — see dataviz skill's categorical
// non-negotiable (max 8 fixed hues). "Uncategorized" (event_category IS
// NULL) is never folded into "Other": it's a distinct, honest bucket for
// missing data, always its own legend entry when present.
const MAX_OWN_CATEGORIES = 7;

function utcDayKeys(fromMs: number, toMs: number): string[] {
  const days: string[] = [];
  const start = new Date(fromMs);
  start.setUTCHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= toMs; t += 24 * 60 * 60 * 1000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

export function DriverBreakdownChart({
  symbol,
  label,
  fromIso,
  toIso,
  rangeId,
}: {
  symbol: string;
  label: string;
  fromIso: string;
  toIso: string;
  rangeId: string;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["driver-breakdown", symbol, fromIso, toIso],
    queryFn: async () => {
      const res = await fetch(
        `/api/signals/driver-breakdown?symbol=${encodeURIComponent(symbol)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
      );
      const json = (await res.json()) as { rows?: Row[]; error?: string };
      // A response carrying json.error (rate limit, DB error, unavailable
      // client, unauthenticated) is a failure, not data — thrown so
      // react-query retries it and never caches it as a success.
      if (json.error) throw new Error(json.error);
      return { rows: json.rows ?? [] };
    },
    retry: 2,
  });
  const rows = data?.rows ?? [];
  const loadErrorCode = error instanceof Error ? error.message : null;

  // Client-side, already-fetched-data toggle — no refetch on click.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const { series, chartData, totalCount, showUncategorizedNote, allUncategorized } = useMemo(() => {
    const partition = partitionCategoryCounts(rows);
    const orderedKeys = orderSeriesKeys(partition, MAX_OWN_CATEGORIES);
    const overflowKeySet = new Set(
      partition.realCategories.slice(MAX_OWN_CATEGORIES).map(([cat]) => cat),
    );

    const seriesList: { key: BucketKey; label: string; color: string }[] = orderedKeys.map((key) => {
      if (key === UNCATEGORIZED_KEY) {
        return { key: UNCATEGORIZED_KEY, label: "Older signals (not categorized)", color: UNCATEGORIZED_COLOR };
      }
      if (key === OTHER_KEY) {
        return { key: OTHER_KEY, label: OTHER_LABEL, color: CATEGORY_COLORS[MAX_OWN_CATEGORIES] };
      }
      const i = partition.realCategories.findIndex(([cat]) => cat === key);
      return {
        key: key as EventCategory,
        label: EVENT_CATEGORY_LABELS[key as EventCategory] ?? key,
        color: CATEGORY_COLORS[i],
      };
    });

    const fromMs = new Date(fromIso).getTime();
    const toMs = new Date(toIso).getTime();
    const days = utcDayKeys(fromMs, toMs);
    const byDay = new Map<string, Record<string, number>>(days.map((d) => [d, {}]));
    for (const r of rows) {
      const bucket = byDay.get(r.date);
      if (!bucket) continue; // outside the computed day range — shouldn't happen given from/to match the query
      const seriesKey = overflowKeySet.has(r.category) ? OTHER_KEY : r.category;
      bucket[seriesKey] = (bucket[seriesKey] ?? 0) + r.count;
    }
    const chartRows = days.map((d) => ({ date: d, ...byDay.get(d) }));

    const showUncategorizedNote = shouldShowUncategorizedNote(partition.total, partition.uncategorizedTotal);
    return {
      series: seriesList,
      chartData: chartRows,
      totalCount: partition.total,
      showUncategorizedNote,
      allUncategorized: isAllUncategorized(partition),
    };
  }, [rows, fromIso, toIso]);

  return (
    <div className="bg-surface-container/40 border border-outline-variant/30 rounded-xl p-6 mb-10" data-testid="driver-breakdown-chart">
      <h2 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase mb-1">
        Signal Drivers — {rangeId}
      </h2>
      <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant/70 uppercase tracking-widest mb-4">
        Daily signal counts by event category. Informational only — not a trading recommendation.
      </p>

      {isLoading ? (
        <Skeleton className="h-[220px] w-full rounded-lg" data-testid="driver-breakdown-skeleton" />
      ) : isError && loadErrorCode === "unauthenticated" ? (
        <div className="flex flex-col items-center gap-3 py-16" data-testid="driver-breakdown-error">
          <p className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center">
            Sign in to see driver data.
          </p>
          <button
            type="button"
            data-testid="driver-breakdown-retry"
            onClick={() => refetch()}
            className="px-3 py-1 rounded-sm font-label text-[11px] md:text-[9px] font-bold tracking-widest uppercase border border-outline-variant/40 text-on-surface hover:bg-surface-container/60 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : isError || totalCount === 0 ? (
        // The price chart above this panel has its own data source and never
        // depends on this request — a failed/empty driver fetch loses only
        // this panel's content, never the price chart, and always shows this
        // line rather than leaving the panel blank.
        <div className="flex flex-col items-center gap-3 py-16" data-testid="driver-breakdown-unavailable">
          <p className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center">
            Signal breakdown unavailable for this range.
          </p>
          {isError && (
            <button
              type="button"
              data-testid="driver-breakdown-retry"
              onClick={() => refetch()}
              className="px-3 py-1 rounded-sm font-label text-[11px] md:text-[9px] font-bold tracking-widest uppercase border border-outline-variant/40 text-on-surface hover:bg-surface-container/60 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Signal driver legend">
            {series.map((s) => {
              const isHidden = hidden.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  data-testid={`driver-legend-${s.key}`}
                  aria-pressed={!isHidden}
                  onClick={() => toggle(s.key)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-sm font-label text-[11px] md:text-[9px] font-bold tracking-widest uppercase border transition-colors cursor-pointer"
                  style={{
                    borderColor: isHidden ? "#3c4a42" : s.color,
                    color: isHidden ? "#6b7570" : "#e8ece9",
                    opacity: isHidden ? 0.5 : 1,
                  }}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  }
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fontSize: 10, fontFamily: "monospace" }}
                  minTickGap={40}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fontSize: 10, fontFamily: "monospace" }}
                  width={30}
                />
                <Tooltip
                  labelFormatter={(d) => new Date(d as string).toLocaleDateString()}
                  contentStyle={{
                    background: "#141414",
                    border: "1px solid rgba(255,255,255,0.1)",
                    fontSize: 11,
                  }}
                />
                {series
                  .filter((s) => !hidden.has(s.key))
                  .map((s) => (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stackId="drivers"
                      stroke={s.color}
                      fill={s.color}
                      fillOpacity={0.55}
                    />
                  ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {allUncategorized ? (
            <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant/70 uppercase tracking-widest text-center mt-3">
              Signals in this range were created before categories were added, so they are grouped together. The price
              chart is not affected.
            </p>
          ) : (
            showUncategorizedNote && (
              <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant/70 uppercase tracking-widest text-center mt-3">
                Most signals in this range have no event category stored, so they show as Uncategorized.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
