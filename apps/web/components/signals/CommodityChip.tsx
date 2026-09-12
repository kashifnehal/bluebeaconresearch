"use client";

import type { Direction } from "@blue-beacon-research/shared";
import {
  commodityChipAriaLabel,
  formatConfidencePercent,
} from "@/lib/signal-display";

export function CommodityChip({
  asset,
  direction,
  confidence,
  size = "sm",
}: {
  asset: string;
  direction: Direction;
  confidence: number;
  size?: "sm" | "md";
}) {
  const cls =
    direction === "up"
      ? "bg-success-subtle text-price-up"
      : direction === "down"
        ? "bg-danger-subtle text-price-down"
        : direction === "volatile"
          ? "bg-warning-subtle text-warning"
          : "bg-surface-container-low text-outline";

  const arrow =
    direction === "up" ? "↑" : direction === "down" ? "↓" : direction === "volatile" ? "↕" : "→";

  const confidenceLabel = formatConfidencePercent(confidence);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 ${cls}`}
      aria-label={commodityChipAriaLabel(asset, direction, confidence)}
    >
      <span className="font-mono">{asset}</span>
      <span>{arrow}</span>
      {size === "md" ? (
        <span className="text-outline" title={`${confidenceLabel} confidence`}>
          {confidenceLabel}
        </span>
      ) : null}
    </span>
  );
}

