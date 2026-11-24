// TASK NQW3-FILTER1 Part 4.2 — tests for the binomial p-value function, the
// day-pairing logic, and the asset-direction table, all with fixed data.
import assert from "node:assert/strict";
import {
  exactBinomialTwoSidedP,
  pairDaysWithBothDirections,
  sameDayTest,
  computeAssetDirectionTable,
  parseMeasureDirectionArgs,
  type OutcomeRow,
} from "./measure-direction.js";

let failed = false;
function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

// ── exactBinomialTwoSidedP ────────────────────────────────────────────────

runTest("exactBinomialTwoSidedP: k=n/2 of an even n gives p=1 (perfectly balanced)", () => {
  assert.equal(exactBinomialTwoSidedP(5, 10), 1);
});

runTest("exactBinomialTwoSidedP: k=0 or k=n (all one way) gives the smallest p-value", () => {
  const p10 = exactBinomialTwoSidedP(10, 10);
  const p0 = exactBinomialTwoSidedP(0, 10);
  assert.equal(p10, p0, "symmetric: all up or all down give the same p-value");
  // 2 * (0.5)^10 for a one-sided tail at the extreme, matches the known value.
  assert.ok(Math.abs(p10 - 2 * Math.pow(0.5, 10)) < 1e-9);
});

runTest("exactBinomialTwoSidedP: 10 of 33 days up-higher (CLAUDE.md example scale) gives a low but valid p-value", () => {
  const p = exactBinomialTwoSidedP(10, 33);
  assert.ok(p > 0 && p < 1);
  assert.ok(p < 0.05, `expected a low p-value for 10/33, got ${p}`);
});

runTest("exactBinomialTwoSidedP: n=0 returns 1 (no trials, nothing to test)", () => {
  assert.equal(exactBinomialTwoSidedP(0, 0), 1);
});

runTest("exactBinomialTwoSidedP: out-of-range k throws", () => {
  assert.throws(() => exactBinomialTwoSidedP(11, 10));
  assert.throws(() => exactBinomialTwoSidedP(-1, 10));
});

runTest("exactBinomialTwoSidedP: p-value never exceeds 1 even summed across every outcome", () => {
  for (let n = 1; n <= 20; n++) {
    for (let k = 0; k <= n; k++) {
      assert.ok(exactBinomialTwoSidedP(k, n) <= 1);
    }
  }
});

// ── pairDaysWithBothDirections / sameDayTest ─────────────────────────────

function row(partial: Partial<OutcomeRow> & { asset: string; eventDate: string }): OutcomeRow {
  return {
    signalId: `s-${Math.random()}`,
    checkpointHours: 24,
    predictedDirection: "up",
    actualPctChange: 0,
    directionShown: null,
    ...partial,
  };
}

const predictedOf = (r: OutcomeRow) => r.predictedDirection;

runTest("pairDaysWithBothDirections: only includes days with both an up and a down call for OIL_ASSETS", () => {
  const rows: OutcomeRow[] = [
    // Day 1: both up and down -> qualifies.
    row({ asset: "USOIL", eventDate: "2026-11-01T00:00:00Z", predictedDirection: "up", actualPctChange: 1.0 }),
    row({ asset: "UKOIL", eventDate: "2026-11-01T06:00:00Z", predictedDirection: "down", actualPctChange: -0.5 }),
    // Day 2: only up -> excluded.
    row({ asset: "USOIL", eventDate: "2026-11-02T00:00:00Z", predictedDirection: "up", actualPctChange: 0.8 }),
    // Day 3: a non-oil asset with both directions must not count toward oil pairing.
    row({ asset: "NGAS", eventDate: "2026-11-03T00:00:00Z", predictedDirection: "up", actualPctChange: 2.0 }),
    row({ asset: "NGAS", eventDate: "2026-11-03T00:00:00Z", predictedDirection: "down", actualPctChange: -2.0 }),
  ];
  const pairings = pairDaysWithBothDirections(rows, 24, predictedOf);
  assert.equal(pairings.length, 1);
  assert.equal(pairings[0].day, "2026-11-01");
  assert.equal(pairings[0].meanMoveUpPct, 1.0);
  assert.equal(pairings[0].meanMoveDownPct, -0.5);
  assert.equal(pairings[0].upHigher, true);
});

runTest("pairDaysWithBothDirections: respects checkpointHours — a 48h row does not pollute a 24h pairing", () => {
  const rows: OutcomeRow[] = [
    row({ asset: "USOIL", eventDate: "2026-11-01T00:00:00Z", checkpointHours: 24, predictedDirection: "up", actualPctChange: 1.0 }),
    row({ asset: "UKOIL", eventDate: "2026-11-01T00:00:00Z", checkpointHours: 48, predictedDirection: "down", actualPctChange: -5.0 }),
  ];
  const pairings24 = pairDaysWithBothDirections(rows, 24, predictedOf);
  assert.equal(pairings24.length, 0, "no down call at 24h on this day");
  const pairings48 = pairDaysWithBothDirections(rows, 48, predictedOf);
  assert.equal(pairings48.length, 0, "no up call at 48h on this day");
});

runTest("pairDaysWithBothDirections: averages multiple up/down rows on the same day correctly", () => {
  const rows: OutcomeRow[] = [
    row({ asset: "USOIL", eventDate: "2026-11-01T00:00:00Z", predictedDirection: "up", actualPctChange: 2.0 }),
    row({ asset: "UKOIL", eventDate: "2026-11-01T06:00:00Z", predictedDirection: "up", actualPctChange: 4.0 }),
    row({ asset: "USOIL", eventDate: "2026-11-01T12:00:00Z", predictedDirection: "down", actualPctChange: -1.0 }),
    row({ asset: "UKOIL", eventDate: "2026-11-01T18:00:00Z", predictedDirection: "down", actualPctChange: -3.0 }),
  ];
  const pairings = pairDaysWithBothDirections(rows, 24, predictedOf);
  assert.equal(pairings.length, 1);
  assert.equal(pairings[0].meanMoveUpPct, 3.0);
  assert.equal(pairings[0].meanMoveDownPct, -2.0);
});

runTest("sameDayTest: 3 qualifying days, 1 up-higher, matches exactBinomialTwoSidedP(1, 3)", () => {
  const rows: OutcomeRow[] = [
    // Day 1: up-mean (1.0) > down-mean (-1.0) -> upHigher.
    row({ asset: "USOIL", eventDate: "2026-11-01T00:00:00Z", predictedDirection: "up", actualPctChange: 1.0 }),
    row({ asset: "UKOIL", eventDate: "2026-11-01T06:00:00Z", predictedDirection: "down", actualPctChange: -1.0 }),
    // Day 2: up-mean (-2.0) < down-mean (0.5) -> not upHigher.
    row({ asset: "USOIL", eventDate: "2026-11-02T00:00:00Z", predictedDirection: "up", actualPctChange: -2.0 }),
    row({ asset: "UKOIL", eventDate: "2026-11-02T06:00:00Z", predictedDirection: "down", actualPctChange: 0.5 }),
    // Day 3: up-mean (-0.1) < down-mean (0.2) -> not upHigher.
    row({ asset: "USOIL", eventDate: "2026-11-03T00:00:00Z", predictedDirection: "up", actualPctChange: -0.1 }),
    row({ asset: "UKOIL", eventDate: "2026-11-03T06:00:00Z", predictedDirection: "down", actualPctChange: 0.2 }),
  ];
  const result = sameDayTest(rows, 24, predictedOf);
  assert.equal(result.nQualifyingDays, 3);
  assert.equal(result.kUpHigher, 1);
  assert.equal(result.pValue, exactBinomialTwoSidedP(1, 3));
});

runTest("sameDayTest: no qualifying days gives a null p-value, not a throw or NaN", () => {
  const result = sameDayTest([], 24, predictedOf);
  assert.equal(result.nQualifyingDays, 0);
  assert.equal(result.pValue, null);
});

// ── computeAssetDirectionTable ────────────────────────────────────────────

runTest("computeAssetDirectionTable: predicted shares, actual shares, and mean moves are computed per asset/checkpoint", () => {
  const rows: OutcomeRow[] = [
    row({ asset: "USOIL", eventDate: "2026-11-01T00:00:00Z", predictedDirection: "up", actualPctChange: 1.0 }),
    row({ asset: "USOIL", eventDate: "2026-11-02T00:00:00Z", predictedDirection: "up", actualPctChange: -2.0 }),
    row({ asset: "USOIL", eventDate: "2026-11-03T00:00:00Z", predictedDirection: "down", actualPctChange: -0.6 }),
    row({ asset: "USOIL", eventDate: "2026-11-04T00:00:00Z", predictedDirection: "neutral", actualPctChange: 0.1 }),
  ];
  const table = computeAssetDirectionTable(rows, 24, predictedOf);
  assert.equal(table.length, 1);
  const usoil = table[0];
  assert.equal(usoil.nUp, 2);
  assert.equal(usoil.nDown, 1);
  assert.equal(usoil.predictedUpSharePct, (2 / 3) * 100);
  assert.equal(usoil.meanMoveUpPct, (1.0 + -2.0) / 2);
  assert.equal(usoil.meanMoveDownPct, -0.6);
  // actual shares are over ALL 4 rows (including the neutral-predicted one):
  // actual "up" (>=+0.5%) only the first row; actual "down" (<=-0.5%) the 2nd and 3rd.
  assert.equal(usoil.actualUpSharePct, (1 / 4) * 100);
  assert.equal(usoil.actualDownSharePct, (2 / 4) * 100);
});

runTest("computeAssetDirectionTable: direction_shown selector excludes rows where it is null, even if predicted_direction is up/down", () => {
  const rows: OutcomeRow[] = [
    row({ asset: "USOIL", eventDate: "2026-11-01T00:00:00Z", predictedDirection: "up", directionShown: "up", actualPctChange: 1.0 }),
    row({ asset: "USOIL", eventDate: "2026-11-02T00:00:00Z", predictedDirection: "up", directionShown: null, actualPctChange: 2.0 }),
  ];
  const table = computeAssetDirectionTable(rows, 24, (r) => r.directionShown);
  assert.equal(table[0].nUp, 1, "the null-direction_shown row must not count");
});

runTest("computeAssetDirectionTable: empty input returns an empty table, not a throw", () => {
  assert.deepEqual(computeAssetDirectionTable([], 24, predictedOf), []);
});

// ── parseMeasureDirectionArgs ─────────────────────────────────────────────

runTest("parseMeasureDirectionArgs: defaults to 30 days before `now`", () => {
  const now = new Date("2026-11-24T00:00:00.000Z");
  const { sinceIso } = parseMeasureDirectionArgs([], now);
  assert.equal(sinceIso, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
});

runTest("parseMeasureDirectionArgs: --since <date> and --since=<date> both override the default", () => {
  assert.equal(parseMeasureDirectionArgs(["--since", "2026-10-01"]).sinceIso, new Date("2026-10-01").toISOString());
  assert.equal(parseMeasureDirectionArgs(["--since=2026-10-01"]).sinceIso, new Date("2026-10-01").toISOString());
});

runTest("parseMeasureDirectionArgs: an unparseable --since value falls back to the 30-day default instead of throwing", () => {
  const now = new Date("2026-11-24T00:00:00.000Z");
  const { sinceIso } = parseMeasureDirectionArgs(["--since", "not-a-date"], now);
  assert.equal(sinceIso, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
});

if (failed) process.exit(1);
