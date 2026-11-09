export const FLAT_THRESHOLD_PCT = 0.5;

export type ActualDirection = "up" | "down" | "flat";

/**
 * Shared by outcome-tracker.ts (writes actual_direction at the standing
 * FLAT_THRESHOLD_PCT), accuracy.routes.ts (recomputes the same thing from
 * actual_pct_change for the baseline/flat-share figures), and
 * scripts/accuracy-audit.ts (recomputes it at alternate thresholds — 0.25%/
 * 0.5%/1% — to show how sensitive the hit rate is to where this line is
 * drawn). Extracted 2026-11-09 so all three use one definition.
 */
export function actualDirectionFromPct(
  pctChange: number,
  thresholdPct: number = FLAT_THRESHOLD_PCT,
): ActualDirection {
  if (Math.abs(pctChange) < thresholdPct) return "flat";
  return pctChange > 0 ? "up" : "down";
}
