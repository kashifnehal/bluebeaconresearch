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
