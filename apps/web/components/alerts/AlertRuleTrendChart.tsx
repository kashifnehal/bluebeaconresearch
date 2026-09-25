"use client";

import { BarChart, Bar, ResponsiveContainer, Tooltip } from "recharts";

export type DailyCount = { date: string; count: number };

const MIN_MATCHES_FOR_TREND = 3;
const MIN_RULE_AGE_DAYS = 7;

/** True when a rule has too little real history to render a trend without it reading as broken. */
export function isTrendSparse(totalMatches: number, ruleCreatedAt: string): boolean {
  if (totalMatches < MIN_MATCHES_FOR_TREND) return true;
  const ageMs = Date.now() - new Date(ruleCreatedAt).getTime();
  return ageMs < MIN_RULE_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Small 14-day bar chart of real per-day match counts for one alert rule. Desktop shows
 * bars + a "this week" summary number; mobile drops the bars' day labels but keeps the
 * shape and the summary number, per the mobile-verification bar (no measurement-only fix).
 */
export function AlertRuleTrendChart({ dailyCounts }: { dailyCounts: DailyCount[] }) {
  const last7 = dailyCounts.slice(-7);
  const weekTotal = last7.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-24 md:w-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dailyCounts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <Tooltip
              cursor={false}
              formatter={(value) => [`${value} match${value === 1 ? "" : "es"}`, ""]}
              labelFormatter={(label) => formatDayLabel(String(label))}
              contentStyle={{
                background: "#131313",
                border: "1px solid #3c4a42",
                borderRadius: 4,
                fontSize: 11,
              }}
              labelStyle={{ color: "#86948a" }}
              itemStyle={{ color: "#4edea3" }}
            />
            <Bar dataKey="count" fill="#4edea3" radius={[1, 1, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <span className="mono text-[12px] md:text-[10px] text-on-surface/70 font-bold whitespace-nowrap">
        {weekTotal} match{weekTotal === 1 ? "" : "es"} this week
      </span>
    </div>
  );
}

export function AlertRuleTrendEmptyState() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-8 w-24 md:w-28 shrink-0 rounded-sm border border-dashed border-outline-variant/30" aria-hidden="true" />
      <span className="text-[12px] md:text-[10px] text-on-surface/45 italic whitespace-nowrap">
        Not enough history yet
      </span>
    </div>
  );
}
