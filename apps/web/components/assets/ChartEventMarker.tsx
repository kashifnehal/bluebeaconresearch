"use client";

import type { KeyboardEvent } from "react";
import {
  markerAriaLabel,
  severityBand,
  type ChartMarker,
  type SeverityBand,
} from "@/lib/chart-markers";

const BAND_SIZE: Record<SeverityBand, number> = {
  critical: 12,
  high: 10,
  elevated: 9,
  base: 8,
};

// Same bands as SeverityBadge. In the dark theme the 9+ and 8 colours are
// close, so size and fill weight carry the difference as well as colour.
function bandPaint(band: SeverityBand): {
  fill: string;
  fillOpacity: number;
  stroke: string;
} {
  switch (band) {
    case "critical":
      return { fill: "var(--danger)", fillOpacity: 1, stroke: "var(--danger)" };
    case "high":
      return { fill: "var(--warning)", fillOpacity: 1, stroke: "var(--warning)" };
    case "elevated":
      return { fill: "var(--warning)", fillOpacity: 0.4, stroke: "var(--warning)" };
    default:
      return { fill: "none", fillOpacity: 0, stroke: "var(--text-secondary)" };
  }
}

export function ChartEventMarker({
  marker,
  x,
  y,
  active,
  describedBy,
  onActivate,
  onDeactivate,
  onSelect,
}: {
  marker: ChartMarker;
  x: number;
  y: number;
  active: boolean;
  describedBy?: string;
  onActivate: (marker: ChartMarker, x: number) => void;
  onDeactivate: () => void;
  onSelect: (marker: ChartMarker, x: number) => void;
}) {
  const band = severityBand(marker.severity);
  const size = BAND_SIZE[band];
  const paint = bandPaint(band);
  const labelX = x + size / 2 + 3;
  const labelY = y + size - 1;

  function onKeyDown(e: KeyboardEvent<SVGGElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(marker, x);
    } else if (e.key === "Escape") {
      onDeactivate();
    }
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={markerAriaLabel(marker)}
      aria-describedby={active ? describedBy : undefined}
      data-testid="chart-event-marker"
      data-count={marker.count}
      data-band={band}
      style={{ cursor: "pointer", outline: "none" }}
      onMouseEnter={() => onActivate(marker, x)}
      onMouseLeave={onDeactivate}
      onFocus={() => onActivate(marker, x)}
      onBlur={onDeactivate}
      onClick={() => onSelect(marker, x)}
      onKeyDown={onKeyDown}
    >
      {/* Larger invisible target so the small triangle is easy to hit. */}
      <rect x={x - 12} y={y - 2} width={24} height={size + 14} fill="transparent" />
      {active && (
        <circle
          cx={x}
          cy={y + size / 2}
          r={size}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
        />
      )}
      <path
        data-testid="chart-event-marker-triangle"
        d={`M ${x - size / 2} ${y} L ${x + size / 2} ${y} L ${x} ${y + size} Z`}
        fill={paint.fill}
        fillOpacity={paint.fillOpacity}
        stroke={paint.stroke}
        strokeWidth={1.25}
        strokeLinejoin="round"
      />
      {marker.count > 1 && (
        <text
          data-testid="chart-event-marker-count"
          x={labelX}
          y={labelY}
          fontSize={10}
          fontWeight={700}
          fontFamily="monospace"
          fill="var(--text-primary, #e5e2e1)"
        >
          {marker.count}
        </text>
      )}
      {marker.direction && (
        <text
          data-testid="chart-event-marker-arrow"
          x={marker.count > 1 ? labelX + 9 : labelX}
          y={labelY}
          fontSize={10}
          fontFamily="monospace"
          fill="var(--text-secondary)"
        >
          {marker.direction === "up" ? "↑" : "↓"}
        </text>
      )}
    </g>
  );
}

/**
 * Label element for a recharts ReferenceLine. Pass it as `label={{ content:
 * <ChartMarkerLabel ... /> }}` (an element, not an inline function): recharts
 * renders a function `content` as a component type, and a new function each
 * render would remount the marker and drop keyboard focus. For a vertical
 * reference line recharts injects `viewBox` with x at the line and y at the
 * top of the plot area.
 */
export function ChartMarkerLabel({
  viewBox,
  ...rest
}: {
  viewBox?: unknown;
} & Omit<Parameters<typeof ChartEventMarker>[0], "x" | "y">) {
  const vb = viewBox as { x?: number; y?: number } | undefined;
  if (vb?.x == null || vb?.y == null) return null;
  return <ChartEventMarker {...rest} x={vb.x} y={vb.y} />;
}
