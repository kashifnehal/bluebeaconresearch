import { FLAT_THRESHOLD_PCT, actualDirectionFromPct } from "./outcome-threshold.js";

/**
 * Pure aggregates for scripts/accuracy-audit.ts (not applied to the public
 * /accuracy route — that one is accuracy.routes.ts). Written 2026-11-09 to
 * answer a specific honesty question with checkable numbers: does the stored
 * hit rate actually beat doing nothing (calling "up" at the base rate the
 * market rises), once flat moves are accounted for. See each field's comment
 * for exactly what it counts and over what denominator — none of this is a
 * published figure, it's read straight off signal_outcomes.
 */

export const AUDIT_CHECKPOINT_HOURS = [1, 4, 24, 48] as const;

// Alternate flat thresholds the audit recomputes hit rate at, to show how
// much of the headline-adjacent number is just where this line is drawn.
// 0.5 is the standing FLAT_THRESHOLD_PCT outcome-tracker.ts actually writes
// actual_direction with; 0.25 and 1 are not applied to stored rows, only
// recomputed here from actual_pct_change.
export const AUDIT_THRESHOLDS_PCT = [0.25, 0.5, 1] as const;

export type AuditOutcomeRow = {
  signal_id: string;
  checkpoint_hours: number;
  predicted_direction: string;
  actual_pct_change: number;
};

export type HorizonAudit = {
  checkpointHours: number;
  /** Every signal_outcomes row at this checkpoint, any predicted_direction. */
  nRows: number;
  nDistinctSignals: number;
  /**
   * Share of up/down-predicted ("scored") rows at this checkpoint whose
   * actual move was under FLAT_THRESHOLD_PCT — these count as misses in
   * is_directionally_correct regardless of which way the price barely
   * moved. null when there are no scored rows.
   */
  flatSharePct: number | null;
  /** Share of scored (up+down predicted) rows that predicted "up". */
  upCallSharePct: number | null;
  /** Of rows predicted "up", the share whose actual move was also "up" (FLAT_THRESHOLD_PCT). */
  upHitRatePct: number | null;
  /** Of rows predicted "down", the share whose actual move was also "down" (FLAT_THRESHOLD_PCT). */
  downHitRatePct: number | null;
  /**
   * Baseline: of ALL rows at this checkpoint (any predicted_direction, since
   * this describes the market, not our calls), the share whose actual move
   * was "up" at FLAT_THRESHOLD_PCT. null when there are no rows.
   */
  marketRoseSharePct: number | null;
  /**
   * Combined up+down hit rate recomputed at each of AUDIT_THRESHOLDS_PCT
   * instead of the stored FLAT_THRESHOLD_PCT. Key is the threshold as a
   * string ("0.25"/"0.5"/"1"). null when there are no scored rows.
   */
  hitRateAtThresholdPct: Record<string, number | null>;
};

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

export function computeHorizonAudit(
  rows: AuditOutcomeRow[],
  checkpointHours: number,
): HorizonAudit {
  const horizonRows = rows.filter((r) => r.checkpoint_hours === checkpointHours);
  const nRows = horizonRows.length;
  const nDistinctSignals = new Set(horizonRows.map((r) => r.signal_id)).size;

  const roseCount = horizonRows.filter(
    (r) => actualDirectionFromPct(r.actual_pct_change, FLAT_THRESHOLD_PCT) === "up",
  ).length;

  const upRows = horizonRows.filter((r) => r.predicted_direction === "up");
  const downRows = horizonRows.filter((r) => r.predicted_direction === "down");
  const scoredCalls = upRows.length + downRows.length;

  const flatScoredCount = [...upRows, ...downRows].filter(
    (r) => actualDirectionFromPct(r.actual_pct_change, FLAT_THRESHOLD_PCT) === "flat",
  ).length;

  const upCorrect = upRows.filter(
    (r) => actualDirectionFromPct(r.actual_pct_change, FLAT_THRESHOLD_PCT) === "up",
  ).length;
  const downCorrect = downRows.filter(
    (r) => actualDirectionFromPct(r.actual_pct_change, FLAT_THRESHOLD_PCT) === "down",
  ).length;

  const hitRateAtThresholdPct: Record<string, number | null> = {};
  for (const threshold of AUDIT_THRESHOLDS_PCT) {
    const upOk = upRows.filter(
      (r) => actualDirectionFromPct(r.actual_pct_change, threshold) === "up",
    ).length;
    const downOk = downRows.filter(
      (r) => actualDirectionFromPct(r.actual_pct_change, threshold) === "down",
    ).length;
    hitRateAtThresholdPct[String(threshold)] = pct(upOk + downOk, scoredCalls);
  }

  return {
    checkpointHours,
    nRows,
    nDistinctSignals,
    flatSharePct: pct(flatScoredCount, scoredCalls),
    upCallSharePct: pct(upRows.length, scoredCalls),
    upHitRatePct: pct(upCorrect, upRows.length),
    downHitRatePct: pct(downCorrect, downRows.length),
    marketRoseSharePct: pct(roseCount, nRows),
    hitRateAtThresholdPct,
  };
}

function fmt(value: number | null, digits = 1): string {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

export function renderAccuracyAuditMarkdown(
  audits: HorizonAudit[],
  generatedAtIso: string,
): string {
  const lines = [
    "# Accuracy audit",
    "",
    `Generated: ${generatedAtIso}`,
    `Read-only. Source: signal_outcomes (service client). Flat threshold for the main columns: ${FLAT_THRESHOLD_PCT}%.`,
    "",
    "| Horizon | n rows | n signals | Flat share | Up-call share | Up hit rate | Down hit rate | Market rose (baseline) |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const a of audits) {
    lines.push(
      `| ${a.checkpointHours}h | ${a.nRows} | ${a.nDistinctSignals} | ${fmt(a.flatSharePct)} | ${fmt(a.upCallSharePct)} | ${fmt(a.upHitRatePct)} | ${fmt(a.downHitRatePct)} | ${fmt(a.marketRoseSharePct)} |`,
    );
  }
  lines.push(
    "",
    "## Hit rate at alternate flat thresholds (combined up+down, not the stored actual_direction)",
    "",
    `| Horizon | ${AUDIT_THRESHOLDS_PCT.map((t) => `@${t}%`).join(" | ")} |`,
    `|---|${AUDIT_THRESHOLDS_PCT.map(() => "---").join("|")}|`,
  );
  for (const a of audits) {
    const cells = AUDIT_THRESHOLDS_PCT.map((t) => fmt(a.hitRateAtThresholdPct[String(t)]));
    lines.push(`| ${a.checkpointHours}h | ${cells.join(" | ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}
