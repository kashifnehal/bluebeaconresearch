import assert from "node:assert/strict";
import { driverBreakdownToCsv } from "./driver-breakdown-csv";

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

runTest("header line has the 3 columns in order", () => {
  const csv = driverBreakdownToCsv([], "USOIL", "This Week");
  assert.equal(csv, '"Date","Category","Signals"');
});

runTest("empty rows give header only", () => {
  const csv = driverBreakdownToCsv([], "USOIL", "This Week");
  assert.equal(csv.split("\r\n").length, 1);
});

runTest("rows are sorted by date then by category label", () => {
  const csv = driverBreakdownToCsv(
    [
      { date: "2026-11-10", category: "sanctions_trade_policy", count: 2 },
      { date: "2026-11-09", category: "armed_conflict_security", count: 1 },
      { date: "2026-11-09", category: "production_output_decision", count: 3 },
    ],
    "USOIL",
    "This Week",
  );
  const lines = csv.split("\r\n").slice(1);
  assert.deepEqual(lines, [
    '"2026-11-09","Armed Conflict & Security","1"',
    '"2026-11-09","Production & Output Decision","3"',
    '"2026-11-10","Sanctions & Trade Policy","2"',
  ]);
});

runTest("uncategorized rows get their legend label and stay their own line, never folded", () => {
  const csv = driverBreakdownToCsv(
    [
      { date: "2026-11-09", category: "uncategorized", count: 5 },
      { date: "2026-11-09", category: "other_market_relevant", count: 1 },
    ],
    "USOIL",
    "This Week",
  );
  const lines = csv.split("\r\n").slice(1);
  assert.equal(lines.length, 2);
  assert.ok(lines.some((l) => l === '"2026-11-09","Older signals (not categorized)","5"'));
  assert.ok(lines.some((l) => l === '"2026-11-09","Other Market-Relevant","1"'));
});

runTest('a category label starting with "=" gets the quote-prefix guard', () => {
  const csv = driverBreakdownToCsv(
    [{ date: "2026-11-09", category: "=SUM(A1:A9)", count: 4 }],
    "USOIL",
    "This Week",
  );
  const line = csv.split("\r\n")[1];
  assert.equal(line, '"2026-11-09","\'=SUM(A1:A9)","4"');
});

runTest("counts only — no percentages, direction, or score fields in any line", () => {
  const csv = driverBreakdownToCsv(
    [{ date: "2026-11-09", category: "armed_conflict_security", count: 7 }],
    "USOIL",
    "This Week",
  );
  assert.doesNotMatch(csv, /%/);
  const dataLine = csv.split("\r\n")[1];
  assert.equal(dataLine, '"2026-11-09","Armed Conflict & Security","7"');
});
