"use client";

import type { Direction } from "@blue-beacon-research/shared";
import { commodityChipAriaLabel } from "@/lib/signal-display";

export function CommodityChip({
  asset,
  direction,
  confidence,
  size: _size = "sm",
  label,
}: {
  asset: string;
  direction: Direction;
  confidence: number;
  size?: "sm" | "md";
  /** Optional one-word context label rendered above the chip, e.g. "Predicted". */
  label?: string;
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

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      {label ? (
        <span className="text-[12px] md:text-[9px] font-black uppercase tracking-widest text-muted">
          {label}
        </span>
      ) : null}
      <span
        className={`inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 ${cls}`}
        aria-label={commodityChipAriaLabel(asset, direction, confidence)}
      >
        <span className="font-mono">{asset}</span>
        <span>{arrow}</span>
      </span>
    </span>
  );
}

