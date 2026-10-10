"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { MarketImpactCheckpointPoint } from "@/lib/market-impact-assessment";

/**
 * Event-time chart of the same per-checkpoint median moves the magnitude
 * sentence already computes (MacKinlay 1997 event-study convention: outcome
 * plotted against event-relative time, not calendar time). Only checkpoints
 * that individually cleared MIN_SAMPLE_SIZE arrive here, so every bar shown
 * is backed by a real sample.
 */
export function MarketImpactChart({
  checkpoints,
}: {
  checkpoints: MarketImpactCheckpointPoint[];
}) {
  const data = checkpoints.map((c) => ({
    label: `${c.checkpointHours}h`,
    medianMovePct: c.medianMovePct,
    sampleSize: c.sampleSize,
    unchangedCount: c.unchangedCount,
  }));

  return (
    <div data-testid="market-impact-chart" className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.3)" }}
            tick={{ fontSize: 10, fontFamily: "monospace", fill: "#86948a" }}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            formatter={(value, _name, item) => {
              const payload = item?.payload as
                | { sampleSize?: number; unchangedCount?: number }
                | undefined;
              const sampleSize = payload?.sampleSize;
              const unchangedCount = payload?.unchangedCount;
              return [
                `${Number(value).toFixed(2)}% (n=${sampleSize ?? "?"}; ${unchangedCount ?? 0} unchanged left out)`,
                "Median move",
              ];
            }}
            contentStyle={{
              background: "#131313",
              border: "1px solid #3c4a42",
              borderRadius: 4,
              fontSize: 11,
            }}
            labelStyle={{ color: "#86948a" }}
            itemStyle={{ color: "#4edea3" }}
          />
          <Bar dataKey="medianMovePct" fill="#4edea3" radius={[2, 2, 0, 0]}>
            <LabelList
              dataKey="medianMovePct"
              position="top"
              formatter={(value: unknown) => `${Number(value).toFixed(1)}%`}
              style={{ fontSize: 10, fill: "#86948a", fontFamily: "monospace" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
