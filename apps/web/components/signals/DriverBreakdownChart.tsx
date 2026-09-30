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
import { Skeleton } from "@/components/ui/skeleton";

const UNCATEGORIZED_KEY = "uncategorized" as const;
type BucketKey = EventCategory | typeof UNCATEGORIZED_KEY | "other";

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
// Above this share of a window's signals being "Uncategorized", the note
// below explaining why is worth showing — chosen so a couple of stray
// pre-#141 rows in an otherwise well-classified window doesn't trigger it.
const UNCATEGORIZED_NOTE_THRESHOLD = 0.8;

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
  const { data, isLoading } = useQuery({
    queryKey: ["driver-breakdown", symbol, fromIso, toIso],
    queryFn: async () => {
      const res = await fetch(
        `/api/signals/driver-breakdown?symbol=${encodeURIComponent(symbol)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
      );
      const json = (await res.json()) as { rows?: Row[]; error?: string };
      return { rows: json.rows ?? [], error: json.error ?? null };
    },
  });
  const rows = data?.rows ?? [];
  // Distinct from the genuine "no signals in this range" state below — a
  // rate limit or DB error must never render as if BBR simply has no data.
  const loadError = data?.error ?? null;

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

  const { series, chartData, totalCount, showUncategorizedNote } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of rows) totals.set(r.category, (totals.get(r.category) ?? 0) + r.count);

    const uncategorizedTotal = totals.get(UNCATEGORIZED_KEY) ?? 0;
    const realCategories = Array.from(totals.entries())
      .filter(([cat]) => cat !== UNCATEGORIZED_KEY)
      .sort((a, b) => b[1] - a[1]);
    const ownReal = realCategories.slice(0, MAX_OWN_CATEGORIES);
    const overflowReal = realCategories.slice(MAX_OWN_CATEGORIES);
    const otherTotal = overflowReal.reduce((sum, [, c]) => sum + c, 0);

    const seriesList: { key: BucketKey; label: string; color: string }[] = ownReal.map(
      ([cat], i) => ({
        key: cat as EventCategory,
        label: EVENT_CATEGORY_LABELS[cat as EventCategory] ?? cat,
        color: CATEGORY_COLORS[i],
      }),
    );
    if (otherTotal > 0) {
      seriesList.push({ key: "other", label: OTHER_LABEL, color: CATEGORY_COLORS[MAX_OWN_CATEGORIES] });
    }
    if (uncategorizedTotal > 0) {
      seriesList.push({ key: UNCATEGORIZED_KEY, label: "Uncategorized", color: UNCATEGORIZED_COLOR });
    }

    const overflowKeySet = new Set(overflowReal.map(([cat]) => cat));
    const fromMs = new Date(fromIso).getTime();
    const toMs = new Date(toIso).getTime();
    const days = utcDayKeys(fromMs, toMs);
    const byDay = new Map<string, Record<string, number>>(days.map((d) => [d, {}]));
    for (const r of rows) {
      const bucket = byDay.get(r.date);
      if (!bucket) continue; // outside the computed day range — shouldn't happen given from/to match the query
      const seriesKey = overflowKeySet.has(r.category) ? "other" : r.category;
      bucket[seriesKey] = (bucket[seriesKey] ?? 0) + r.count;
    }
    const chartRows = days.map((d) => ({ date: d, ...byDay.get(d) }));

    const total = Array.from(totals.values()).reduce((a, b) => a + b, 0);
    const showUncategorizedNote =
      total > 0 && uncategorizedTotal / total > UNCATEGORIZED_NOTE_THRESHOLD;
    return { series: seriesList, chartData: chartRows, totalCount: total, showUncategorizedNote };
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
      ) : loadError ? (
        <p
          className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center py-16"
          data-testid="driver-breakdown-error"
        >
          Couldn&apos;t load driver data. Try again.
        </p>
      ) : totalCount === 0 ? (
        <p className="text-[12px] md:text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest text-center py-16">
          No signals recorded for {label} in this range yet. The price chart is live.
        </p>
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
          {showUncategorizedNote && (
            <p className="text-[12px] md:text-[9px] font-mono text-on-surface-variant/70 uppercase tracking-widest text-center mt-3">
              Most signals in this range were recorded before event categories were stored, so they show as
              Uncategorized.
            </p>
          )}
        </>
      )}
    </div>
  );
}
