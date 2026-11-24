"use client";

import type { Direction } from "@blue-beacon-research/shared";
import { commodityChipAriaLabel, impactChannelLabel, type DirectionShown } from "@/lib/signal-display";
import { isDirectionV3Enabled } from "@/lib/flags";

export function CommodityChip({
  asset,
  direction,
  confidence,
  size: _size = "sm",
  label,
  // TASK NQW3-FILTER1 Part 6 — both optional and both undefined by default, so
  // every existing call site that doesn't pass them (and any call site when
  // NEXT_PUBLIC_DIRECTION_V3 is off) renders exactly as before this task.
  directionShown,
  impactChannel,
}: {
  asset: string;
  direction: Direction;
  confidence: number;
  size?: "sm" | "md";
  /** Optional one-word context label rendered above the chip, e.g. "Predicted". */
  label?: string;
  /** This commodity_impacts entry's direction_shown (apps/backend shownDirection()), if present. */
  directionShown?: DirectionShown | null;
  /** This commodity_impacts entry's impact_channel, if present — used only when directionShown is "none". */
  impactChannel?: string | null;
}) {
  // Only when the flag is on AND this entry actually carries a direction_shown
  // value — otherwise fall through to today's behavior unchanged, even if the
  // flag is on (most impacts won't have direction_shown until the backend flag
  // is also turned on).
  const showChannelLabel = isDirectionV3Enabled && directionShown === "none";

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
        <span className="text-[12px] md:text-[11px] font-black uppercase tracking-widest text-muted">
          {label}
        </span>
      ) : null}
      <span
        className={`inline-flex items-center gap-1 rounded-full text-xs font-medium px-2.5 py-1 ${cls}`}
        aria-label={
          showChannelLabel
            ? `${asset} ${impactChannelLabel(impactChannel)}`
            : commodityChipAriaLabel(asset, direction, confidence)
        }
      >
        <span className="font-mono">{asset}</span>
        {showChannelLabel ? (
          <span className="text-[11px] normal-case">{impactChannelLabel(impactChannel)}</span>
        ) : (
          <span>{arrow}</span>
        )}
      </span>
    </span>
  );
}

