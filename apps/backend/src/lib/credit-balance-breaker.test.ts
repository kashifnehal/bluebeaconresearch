// TASK NQW3-FILTER1 Part 10 — pure, injected-clock tests for the probe
// mechanism added to the credit-balance circuit breaker. Integration-level
// tests (classifyEvent with a fake client, real short sleeps) live in
// claude.service.test.ts, next to the existing breaker tests.
import assert from "node:assert/strict";
import {
  resetCreditBalanceBreakerForTests,
  setCreditBalanceBreakerProbeIntervalMsForTests,
  isCreditBalanceBreakerOpen,
  openCreditBalanceBreaker,
  canAttemptProbe,
  recordProbeAttempt,
  closeCreditBalanceBreakerAfterProbe,
  closeCreditBalanceBreakerIfExpired,
  parseRegainAccessTime,
} from "./credit-balance-breaker.js";

/** A dated usage-limit message whose own window (capped at recheckMs, default 6h) outlasts the 60-minute probe interval — matches the real production message shape. */
function datedUsageLimitMessage(now: number): string {
  const farFuture = new Date(now + 17 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `You have reached your specified API usage limits. You will regain access on ${farFuture} at 00:00 UTC.`;
}

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

runTest("canAttemptProbe: false when the breaker is closed", () => {
  resetCreditBalanceBreakerForTests();
  assert.equal(canAttemptProbe(1_000), false);
});

runTest("canAttemptProbe: false for the first 60 minutes after the breaker opens (paused state makes no call inside the interval)", () => {
  resetCreditBalanceBreakerForTests();
  const t0 = 1_000_000;
  openCreditBalanceBreaker("Your credit balance is too low to access the Claude API.", t0);
  assert.equal(isCreditBalanceBreakerOpen(t0 + 1), true);
  assert.equal(canAttemptProbe(t0 + 1), false, "1ms after open");
  assert.equal(canAttemptProbe(t0 + 59 * 60 * 1000), false, "59 minutes after open");
});

runTest("canAttemptProbe: true once 60 minutes have passed since the breaker opened (one probe after 60 minutes)", () => {
  resetCreditBalanceBreakerForTests();
  const t0 = 1_000_000;
  // A dated, far-future pause (recheckMs-capped at 6h) so the breaker itself
  // is still open at the 60-minute probe mark — the generic (undated)
  // message's own pauseMs is only 30 minutes, shorter than the probe
  // interval, so it would already be closed by its own window by then.
  openCreditBalanceBreaker(datedUsageLimitMessage(t0), t0);
  const probeTime = t0 + 60 * 60 * 1000;
  assert.equal(canAttemptProbe(probeTime), true);
});

runTest("recordProbeAttempt + canAttemptProbe: at most one probe per interval, using a configurable interval for fast tests", () => {
  resetCreditBalanceBreakerForTests();
  setCreditBalanceBreakerProbeIntervalMsForTests(100);
  const t0 = 1_000_000;
  openCreditBalanceBreaker("Your credit balance is too low to access the Claude API.", t0);
  assert.equal(canAttemptProbe(t0 + 50), false);
  assert.equal(canAttemptProbe(t0 + 100), true);
  recordProbeAttempt(t0 + 100);
  assert.equal(canAttemptProbe(t0 + 150), false, "a second probe must not be allowed right after the first");
  assert.equal(canAttemptProbe(t0 + 200), true, "allowed again a full interval after the last attempt");
});

runTest("closeCreditBalanceBreakerAfterProbe: a successful probe fully closes the breaker, including the probe timer", () => {
  resetCreditBalanceBreakerForTests();
  const t0 = 1_000_000;
  openCreditBalanceBreaker("Your credit balance is too low to access the Claude API.", t0);
  recordProbeAttempt(t0 + 60 * 60 * 1000);
  closeCreditBalanceBreakerAfterProbe();
  assert.equal(isCreditBalanceBreakerOpen(t0 + 60 * 60 * 1000 + 1), false, "breaker is closed");
  // A fresh open right after must behave like the very first open (its own
  // new probe interval), not inherit the old probe timer.
  openCreditBalanceBreaker("Your credit balance is too low to access the Claude API.", t0 + 60 * 60 * 1000 + 1);
  assert.equal(canAttemptProbe(t0 + 60 * 60 * 1000 + 2), false, "the new open resets the probe clock");
});

runTest("a failed probe keeps the breaker open (openCreditBalanceBreaker re-extends the pause)", () => {
  resetCreditBalanceBreakerForTests();
  const t0 = 1_000_000;
  openCreditBalanceBreaker(datedUsageLimitMessage(t0), t0);
  const probeTime = t0 + 60 * 60 * 1000;
  assert.equal(canAttemptProbe(probeTime), true);
  recordProbeAttempt(probeTime);
  // Probe fails -> classifyEvent's catch calls openCreditBalanceBreaker again.
  openCreditBalanceBreaker(datedUsageLimitMessage(probeTime), probeTime);
  assert.equal(isCreditBalanceBreakerOpen(probeTime + 1), true, "still open after the failed probe");
  assert.equal(canAttemptProbe(probeTime + 1), false, "next probe is not due for another full interval");
});

runTest("closeCreditBalanceBreakerIfExpired: also clears the probe timer so a fresh pause starts its own clock", () => {
  resetCreditBalanceBreakerForTests();
  const t0 = 1_000_000;
  openCreditBalanceBreaker("Your credit balance is too low to access the Claude API.", t0); // pauseMs default 30 min
  const expiry = t0 + 30 * 60 * 1000;
  assert.equal(closeCreditBalanceBreakerIfExpired(expiry), true);
  openCreditBalanceBreaker("Your credit balance is too low to access the Claude API.", expiry + 1);
  assert.equal(canAttemptProbe(expiry + 2), false, "fresh open, probe clock restarted");
});

// ── parseRegainAccessTime (exercised again here for the "no throw" requirement) ──

runTest("parseRegainAccessTime: usage-limit text is parsed for the date without throwing, for well-formed and malformed text alike", () => {
  const now = 1_700_000_000_000;
  assert.equal(
    parseRegainAccessTime(
      "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.",
      now,
    ),
    Date.UTC(2026, 11, 1, 0, 0),
  );
  assert.doesNotThrow(() => parseRegainAccessTime(undefined, now));
  assert.doesNotThrow(() => parseRegainAccessTime(null, now));
  assert.doesNotThrow(() => parseRegainAccessTime("", now));
  assert.doesNotThrow(() => parseRegainAccessTime("not a date at all", now));
  assert.doesNotThrow(() => parseRegainAccessTime("regain access on not-a-date at 00:00 UTC", now));
  assert.equal(parseRegainAccessTime("no date here", now), null);
});
