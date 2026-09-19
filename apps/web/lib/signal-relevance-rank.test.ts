import assert from "node:assert/strict";
import { relevanceRankScore, sortByRelevance } from "./signal-relevance-rank";

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
  // Old: severity 9, published 5 days ago. New: severity 5, published 1 hour ago.
  const oldScore = relevanceRankScore(9, "2026-09-15T00:00:00.000Z", NOW);
  const newScore = relevanceRankScore(5, "2026-09-19T23:00:00.000Z", NOW);
  assert.ok(newScore > oldScore, `expected new (${newScore}) > old (${oldScore})`);
});

runTest("all else equal, higher severity ranks above lower severity", () => {
  const ts = "2026-09-19T12:00:00.000Z";
  const high = relevanceRankScore(9, ts, NOW);
  const low = relevanceRankScore(4, ts, NOW);
  assert.ok(high > low);
});

runTest("all else equal, more recent ranks above older", () => {
  const newer = relevanceRankScore(6, "2026-09-19T23:00:00.000Z", NOW);
  const older = relevanceRankScore(6, "2026-09-10T00:00:00.000Z", NOW);
  assert.ok(newer > older);
});

runTest("missing/invalid timestamp treated as hours_since=0, not NaN/crash", () => {
  const score = relevanceRankScore(5, null, NOW);
  assert.ok(Number.isFinite(score) && score > 0);
  const score2 = relevanceRankScore(5, "not-a-date", NOW);
  assert.ok(Number.isFinite(score2) && score2 > 0);
});

runTest("sortByRelevance orders a mixed batch newest/highest-first without mutating input", () => {
  const rows = [
    { id: "old-high", severity: 9, ts: "2026-09-10T00:00:00.000Z" },
    { id: "new-low", severity: 4, ts: "2026-09-19T23:30:00.000Z" },
    { id: "mid", severity: 6, ts: "2026-09-18T00:00:00.000Z" },
  ];
  const original = [...rows];
  const ranked = sortByRelevance(rows, (r) => r.severity, (r) => r.ts, NOW);
  assert.deepEqual(ranked.map((r) => r.id), ["new-low", "mid", "old-high"]);
  assert.deepEqual(rows, original, "must not mutate the input array");
});
