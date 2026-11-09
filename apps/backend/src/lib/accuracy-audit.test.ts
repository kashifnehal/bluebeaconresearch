import assert from "node:assert/strict";
import {
  AUDIT_CHECKPOINT_HOURS,
  AUDIT_THRESHOLDS_PCT,
  computeHorizonAudit,
  renderAccuracyAuditMarkdown,
  type AuditOutcomeRow,
} from "./accuracy-audit.js";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function row(overrides: Partial<AuditOutcomeRow> = {}): AuditOutcomeRow {
  return {
    signal_id: "sig-1",
    checkpoint_hours: 48,
    predicted_direction: "up",
    actual_pct_change: 1,
    ...overrides,
  };
}

runTest("empty rows yield nulls, not zeros, for every rate", () => {
  const audit = computeHorizonAudit([], 48);
  assert.equal(audit.nRows, 0);
  assert.equal(audit.nDistinctSignals, 0);
  assert.equal(audit.flatSharePct, null);
  assert.equal(audit.upCallSharePct, null);
  assert.equal(audit.upHitRatePct, null);
  assert.equal(audit.downHitRatePct, null);
  assert.equal(audit.marketRoseSharePct, null);
  for (const t of AUDIT_THRESHOLDS_PCT) {
    assert.equal(audit.hitRateAtThresholdPct[String(t)], null);
  }
});

runTest(
  "reproduces the no-skill case: up-call hit rate equals the baseline share of windows that rose",
  () => {
    // 80 up-calls, 20 down-calls (80% up-call share, matching the evidence
    // paragraph). Up-calls: 48.2%-ish correct (~39/80 "up"), the rest flat or
    // down. Down-calls: scored at a different rate. Baseline is computed over
    // ALL rows (any predicted_direction), not just the up-calls.
    const rows: AuditOutcomeRow[] = [
      ...Array.from({ length: 39 }, (_, i) =>
        row({ signal_id: `up-correct-${i}`, predicted_direction: "up", actual_pct_change: 1.2 }),
      ),
      ...Array.from({ length: 41 }, (_, i) =>
        row({ signal_id: `up-wrong-${i}`, predicted_direction: "up", actual_pct_change: -0.9 }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        row({ signal_id: `down-correct-${i}`, predicted_direction: "down", actual_pct_change: -1.1 }),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        row({ signal_id: `down-wrong-${i}`, predicted_direction: "down", actual_pct_change: 0.8 }),
      ),
    ];
    const audit = computeHorizonAudit(rows, 48);
    assert.equal(audit.nRows, 100);
    assert.equal(audit.nDistinctSignals, 100);
    assert.equal(audit.upCallSharePct, 80);
    assert.equal(audit.upHitRatePct, (39 / 80) * 100);
    assert.equal(audit.downHitRatePct, (5 / 20) * 100);
    // 39 (up-correct) + 5 (down-correct) rows actually rose/fell appropriately;
    // the baseline only cares whether the market rose, across all 100 rows:
    // 39 up-correct rows rose, plus the 15 "down-wrong" rows (price went up
    // despite a "down" call) = 54 rows that rose.
    assert.equal(audit.marketRoseSharePct, 54);
    assert.equal(audit.flatSharePct, 0);
  },
);

runTest("flat moves under the threshold count as neither up nor down for the baseline", () => {
  const rows: AuditOutcomeRow[] = [
    row({ signal_id: "flat-1", predicted_direction: "up", actual_pct_change: 0.1 }),
    row({ signal_id: "flat-2", predicted_direction: "down", actual_pct_change: -0.2 }),
    row({ signal_id: "real-up", predicted_direction: "up", actual_pct_change: 2 }),
  ];
  const audit = computeHorizonAudit(rows, 48);
  assert.equal(audit.nRows, 3);
  assert.equal(audit.flatSharePct, (2 / 3) * 100);
  assert.equal(audit.marketRoseSharePct, (1 / 3) * 100);
  assert.equal(audit.upHitRatePct, (1 / 2) * 100);
  assert.equal(audit.downHitRatePct, 0);
});

runTest("a different checkpoint_hours value is excluded entirely", () => {
  const rows: AuditOutcomeRow[] = [
    row({ checkpoint_hours: 1 }),
    row({ checkpoint_hours: 48 }),
  ];
  const audit = computeHorizonAudit(rows, 48);
  assert.equal(audit.nRows, 1);
});

runTest("hit rate at alternate thresholds moves a flat-adjacent row across the line", () => {
  // 0.3% move: counted as flat (a miss) at the stored 0.5% threshold, but
  // counted as a correct "up" call once the threshold drops to 0.25%.
  const rows: AuditOutcomeRow[] = [
    row({ signal_id: "borderline", predicted_direction: "up", actual_pct_change: 0.3 }),
  ];
  const audit = computeHorizonAudit(rows, 48);
  assert.equal(audit.upHitRatePct, 0); // stored 0.5% threshold: flat, not correct
  assert.equal(audit.hitRateAtThresholdPct["0.25"], 100);
  assert.equal(audit.hitRateAtThresholdPct["0.5"], 0);
  assert.equal(audit.hitRateAtThresholdPct["1"], 0);
});

runTest("markdown render includes every configured checkpoint and threshold column", () => {
  const audits = AUDIT_CHECKPOINT_HOURS.map((h) => computeHorizonAudit([], h));
  const md = renderAccuracyAuditMarkdown(audits, "2026-11-09T00:00:00.000Z");
  for (const h of AUDIT_CHECKPOINT_HOURS) {
    assert.match(md, new RegExp(`\\| ${h}h \\|`));
  }
  for (const t of AUDIT_THRESHOLDS_PCT) {
    assert.match(md, new RegExp(`@${t}%`));
  }
  assert.match(md, /Read-only\. Source: signal_outcomes/);
});
