"use client";

import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchJsonWithTimeout } from "@/lib/fetch-with-timeout";
import { summarizeCot, type CotPayload, type CotRow } from "@/lib/cot";

function formatReportDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function formatSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${formatInt(n)}`;
}

/** Presentational part, kept free of hooks so it can be rendered in tests. */
export function PositioningPanelView({ rows }: { rows: CotRow[] }) {
  const summary = summarizeCot(rows);
  if (!summary) return null;
  const { latest, netChange } = summary;
  const asOf = formatReportDate(latest.reportDate);
  const stats: { label: string; value: string }[] = [
    { label: "Long", value: formatInt(latest.long) },
    { label: "Short", value: formatInt(latest.short) },
    { label: "Spread", value: latest.spread == null ? "—" : formatInt(latest.spread) },
    { label: "Net change", value: netChange == null ? "—" : formatSigned(netChange) },
  ];
  return (
    <section
      data-testid="positioning-panel"
      aria-label="Managed-money positioning"
      className="bg-surface-container/40 border border-outline-variant/30 rounded-xl p-6 mb-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="font-label text-xs font-bold tracking-widest text-on-surface uppercase">
          Positioning — managed money, net (long minus short)
        </h2>
        <span className="font-mono text-[11px] text-on-surface-variant">Report date {asOf}</span>
      </div>
      <div className="h-[140px]" data-testid="positioning-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="reportDate"
              tickFormatter={(d: string) =>
                new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, {
                  month: "short",
                  year: "2-digit",
                  timeZone: "UTC",
                })
              }
              stroke="rgba(255,255,255,0.3)"
              tick={{ fontSize: 10, fontFamily: "monospace" }}
              minTickGap={40}
            />
            <YAxis
              width={70}
              stroke="rgba(255,255,255,0.3)"
              tick={{ fontSize: 10, fontFamily: "monospace" }}
              tickFormatter={(v: number) => formatInt(v)}
            />
            <Tooltip
              labelFormatter={(d) => formatReportDate(String(d))}
              formatter={(v) => [typeof v === "number" ? formatSigned(v) : String(v), "Net position"]}
              contentStyle={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)", fontSize: 11 }}
            />
            <Area
              type="monotone"
              dataKey="net"
              stroke="var(--accent)"
              fill="var(--accent)"
              fillOpacity={0.15}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="font-label text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {s.label}
            </dt>
            <dd className="font-mono text-sm text-on-surface">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p
        data-testid="positioning-note"
        className="mt-4 text-[12px] md:text-[10px] font-mono text-on-surface-variant/80"
      >
        Weekly report by the US Commodity Futures Trading Commission, positions as of {asOf}, published with a lag.
        Descriptive only.
      </p>
    </section>
  );
}

/** Shows nothing unless /api/cot returns rows for this symbol. */
export function PositioningPanel({ symbol }: { symbol: string }) {
  const { data } = useQuery({
    queryKey: ["cot", symbol],
    queryFn: () => fetchJsonWithTimeout<CotPayload>(`/api/cot?symbol=${encodeURIComponent(symbol)}`),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  if (!data || !data.available || data.rows.length === 0) return null;
  return <PositioningPanelView rows={data.rows} />;
}
