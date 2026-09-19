import assert from "node:assert/strict";
import { relevanceRankScore, sortByRelevance } from "./relevance-rank.js";

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

const NOW = new Date("2026-09-20T00:00:00.000Z");

runTest("a newer, lower-severity signal outranks an older, higher-severity one", () => {
  const oldScore = relevanceRankScore(9, "2026-09-15T00:00:00.000Z", NOW);
  const newScore = relevanceRankScore(5, "2026-09-19T23:00:00.000Z", NOW);
  assert.ok(newScore > oldScore, `expected new (${newScore}) > old (${oldScore})`);
});

runTest("all else equal, higher severity ranks above lower severity", () => {
  const ts = "2026-09-19T12:00:00.000Z";
  assert.ok(relevanceRankScore(9, ts, NOW) > relevanceRankScore(4, ts, NOW));
});

runTest("all else equal, more recent ranks above older", () => {
  assert.ok(
    relevanceRankScore(6, "2026-09-19T23:00:00.000Z", NOW) > relevanceRankScore(6, "2026-09-10T00:00:00.000Z", NOW),
  );
});

runTest("missing/invalid timestamp treated as hours_since=0, not NaN/crash", () => {
  assert.ok(Number.isFinite(relevanceRankScore(5, null, NOW)));
  assert.ok(Number.isFinite(relevanceRankScore(5, "not-a-date", NOW)));
});

runTest("sortByRelevance orders a mixed batch newest/highest-first without mutating input", () => {
  const rows = [
    { id: "old-high", severity: 9, created_at: "2026-09-10T00:00:00.000Z" },
    { id: "new-low", severity: 4, created_at: "2026-09-19T23:30:00.000Z" },
    { id: "mid", severity: 6, created_at: "2026-09-18T00:00:00.000Z" },
  ];
  const original = [...rows];
  const ranked = sortByRelevance(rows, (r) => r.severity, (r) => r.created_at, NOW);
  assert.deepEqual(ranked.map((r) => r.id), ["new-low", "mid", "old-high"]);
  assert.deepEqual(rows, original, "must not mutate the input array");
});
