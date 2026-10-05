import assert from "node:assert/strict";

// alert-dispatcher.ts -> signal-merge.ts -> signal-generator.ts eagerly builds a
// Supabase client at import time (pre-existing, module-scope `getSupabaseAdmin()`
// calls, not something this task touches). ESM evaluates every static import's
// module body before this file's own top-level code runs, so SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY must already be in the environment when this process
// starts — set from the invoking shell (see package.json's "test" script), not
// assigned in-file the way spend-limit-alert.test.ts does for its DI-only dependency.

import {
  shouldDeferForBudget,
  isStoryCooldownHit,
  isInQuietHours,
  MAX_ALERTS_PER_USER_PER_DAY,
} from "./alert-dispatcher.js";

// Doc 298 algorithm A2 — alert-fatigue guard. Pure-function tests only (this repo's
// test runner is plain tsx + node:assert, no module-mocking facility — same reasoning
// as spend-limit-alert.test.ts), so dispatchAlertsForSignal's Supabase-dependent
// batching is exercised through these exported decision functions, not a full DB mock.

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

runTest("the 11th alert of the day is deferred (budget = 10/day, not severity 10)", () => {
  assert.equal(shouldDeferForBudget(MAX_ALERTS_PER_USER_PER_DAY, 5), true);
  // The 10th (count still at 9 before this one lands) is not deferred.
  assert.equal(shouldDeferForBudget(MAX_ALERTS_PER_USER_PER_DAY - 1, 5), false);
});

runTest("severity 10 always passes the budget gate regardless of count", () => {
  assert.equal(shouldDeferForBudget(999, 10), false);
});

runTest("severity 10 always passes the cooldown gate regardless of recent alerts", () => {
  const hit = isStoryCooldownHit({
    severity: 10,
    escalation: false,
    currentSignalId: "sig-2",
    currentSummary: "Oil tankers struck near the Strait of Hormuz",
    recentAlerts: [{ signalId: "sig-1", summary: "Oil tankers struck near the Strait of Hormuz" }],
  });
  assert.equal(hit, false);
});

runTest("cooldown skips a repeat alert for the same story within the window", () => {
  const hit = isStoryCooldownHit({
    severity: 6,
    escalation: false,
    currentSignalId: "sig-2",
    currentSummary: "US strikes on Iranian oil tankers near the Strait of Hormuz",
    recentAlerts: [
      { signalId: "sig-1", summary: "US strikes on Iranian oil tankers near the Strait of Hormuz" },
    ],
  });
  assert.equal(hit, true);
});

runTest("cooldown does not fire for an unrelated story", () => {
  const hit = isStoryCooldownHit({
    severity: 6,
    escalation: false,
    currentSignalId: "sig-2",
    currentSummary: "Central bank raises interest rates by 50 basis points",
    recentAlerts: [
      { signalId: "sig-1", summary: "US strikes on Iranian oil tankers near the Strait of Hormuz" },
    ],
  });
  assert.equal(hit, false);
});

runTest("escalation re-alerts are exempt from the cooldown even for the same story", () => {
  const hit = isStoryCooldownHit({
    severity: 8,
    escalation: true,
    currentSignalId: "sig-1",
    currentSummary: "US strikes on Iranian oil tankers near the Strait of Hormuz",
    recentAlerts: [
      { signalId: "sig-1", summary: "US strikes on Iranian oil tankers near the Strait of Hormuz" },
    ],
  });
  assert.equal(hit, false);
});

runTest("overnight window (22:00 -> 06:00) catches a time after midnight, local tz", () => {
  // 2026-10-02T02:30:00Z is 22:30 the prior day in America/New_York (UTC-4 in Oct, DST).
  const now = new Date("2026-10-02T02:30:00Z");
  assert.equal(isInQuietHours(now, "22:00", "06:00", "America/New_York"), true);
});

runTest("overnight window does not catch a daytime hour, local tz", () => {
  // 2026-10-02T18:00:00Z is 14:00 in America/New_York.
  const now = new Date("2026-10-02T18:00:00Z");
  assert.equal(isInQuietHours(now, "22:00", "06:00", "America/New_York"), false);
});

runTest("non-overnight window (09:00 -> 17:00) matches inside the range, local tz", () => {
  // 2026-10-02T15:30:00Z is 11:30 in America/New_York.
  const now = new Date("2026-10-02T15:30:00Z");
  assert.equal(isInQuietHours(now, "09:00", "17:00", "America/New_York"), true);
});

runTest("non-overnight window does not match outside the range, local tz", () => {
  // 2026-10-02T23:00:00Z is 19:00 in America/New_York.
  const now = new Date("2026-10-02T23:00:00Z");
  assert.equal(isInQuietHours(now, "09:00", "17:00", "America/New_York"), false);
});

runTest("invalid timezone falls back to UTC instead of throwing", () => {
  const now = new Date("2026-10-02T23:00:00Z"); // 23:00 UTC
  assert.equal(isInQuietHours(now, "22:00", "06:00", "Not/AZone"), true);
  assert.equal(isInQuietHours(now, "09:00", "17:00", "Not/AZone"), false);
});

runTest("null/undefined timezone falls back to UTC", () => {
  const now = new Date("2026-10-02T23:00:00Z"); // 23:00 UTC
  assert.equal(isInQuietHours(now, "22:00", "06:00", null), true);
  assert.equal(isInQuietHours(now, "22:00", "06:00", undefined), true);
});

runTest("DST transition day (America/New_York, spring-forward) resolves correctly on both sides", () => {
  // 2026-03-08 is DST start in the US. 06:30 local (post-transition, EDT=UTC-4) is 10:30Z.
  const afterTransition = new Date("2026-03-08T10:30:00Z");
  assert.equal(isInQuietHours(afterTransition, "22:00", "07:00", "America/New_York"), true);
  // 08:30 local is outside the 22:00->07:00 quiet window.
  const outsideWindow = new Date("2026-03-08T12:30:00Z");
  assert.equal(isInQuietHours(outsideWindow, "22:00", "07:00", "America/New_York"), false);
});
