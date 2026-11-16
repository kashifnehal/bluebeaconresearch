import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

import { summarizeDbProbeHistory, type DbProbeHistoryEntry } from "./admin.js";

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

runTest("an empty history gives an all-zero summary", () => {
  const summary = summarizeDbProbeHistory([]);
  assert.deepEqual(summary, { count: 0, failures: 0, p50_ms: 0, p95_ms: 0, longest_failure_streak: 0 });
});

// GET /v1/admin/db-probe-history — BE-DB-RES1 route-backing-logic test. Entries
// here are deliberately listed newest-first (as the real route would hand them
// over straight from a Redis LPUSH/LRANGE read), 20 probes with ms values chosen
// so the nearest-rank p50/p95 land on known values, and two failure runs (one of
// 2, one of 3) to pin down longest_failure_streak.
const FIXTURE: DbProbeHistoryEntry[] = [
  { at: "2026-11-16T00:00:00Z", ok: true, ms: 10 },
  { at: "2026-11-15T23:55:00Z", ok: true, ms: 12 },
  { at: "2026-11-15T23:50:00Z", ok: false, ms: 10000, error: "timeout after 10000 ms" },
  { at: "2026-11-15T23:45:00Z", ok: false, ms: 10000, error: "timeout after 10000 ms" },
  { at: "2026-11-15T23:40:00Z", ok: false, ms: 10000, error: "timeout after 10000 ms" },
  { at: "2026-11-15T23:35:00Z", ok: true, ms: 14 },
  { at: "2026-11-15T23:30:00Z", ok: true, ms: 16 },
  { at: "2026-11-15T23:25:00Z", ok: false, ms: 9000, error: "connection refused" },
  { at: "2026-11-15T23:20:00Z", ok: false, ms: 9000, error: "connection refused" },
  { at: "2026-11-15T23:15:00Z", ok: true, ms: 18 },
  { at: "2026-11-15T23:10:00Z", ok: true, ms: 20 },
  { at: "2026-11-15T23:05:00Z", ok: true, ms: 22 },
  { at: "2026-11-15T23:00:00Z", ok: true, ms: 24 },
  { at: "2026-11-15T22:55:00Z", ok: true, ms: 26 },
  { at: "2026-11-15T22:50:00Z", ok: true, ms: 28 },
  { at: "2026-11-15T22:45:00Z", ok: true, ms: 30 },
  { at: "2026-11-15T22:40:00Z", ok: true, ms: 32 },
  { at: "2026-11-15T22:35:00Z", ok: true, ms: 34 },
  { at: "2026-11-15T22:30:00Z", ok: true, ms: 36 },
  { at: "2026-11-15T22:25:00Z", ok: true, ms: 38 },
];

runTest("a fixed 20-entry fixture gives the expected count and failure count", () => {
  const summary = summarizeDbProbeHistory(FIXTURE);
  assert.equal(summary.count, 20);
  assert.equal(summary.failures, 5);
});

runTest("the fixture's p50_ms is the nearest-rank median of the sorted ms values", () => {
  // Sorted ms: 10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,9000,9000,10000,10000,10000
  // ceil(0.50 * 20) = 10 -> index 9 (0-based) -> 28
  const summary = summarizeDbProbeHistory(FIXTURE);
  assert.equal(summary.p50_ms, 28);
});

runTest("the fixture's p95_ms is the nearest-rank 95th percentile of the sorted ms values", () => {
  // ceil(0.95 * 20) = 19 -> index 18 (0-based) -> 10000
  const summary = summarizeDbProbeHistory(FIXTURE);
  assert.equal(summary.p95_ms, 10000);
});

runTest("the fixture's longest_failure_streak is the longest run of consecutive failures", () => {
  // The 3-in-a-row run (23:50–23:40) beats the 2-in-a-row run (23:25–23:20).
  const summary = summarizeDbProbeHistory(FIXTURE);
  assert.equal(summary.longest_failure_streak, 3);
});

runTest("a history with no failures gives a longest_failure_streak of 0", () => {
  const summary = summarizeDbProbeHistory(FIXTURE.filter((e) => e.ok));
  assert.equal(summary.longest_failure_streak, 0);
});
