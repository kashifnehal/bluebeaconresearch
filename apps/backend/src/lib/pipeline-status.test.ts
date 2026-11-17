import assert from "node:assert/strict";

// W7-IO-FIX-v2 — getIngestionIntervalMinutes() previously only matched the exact
// "*/N * * * *" shape and silently fell back to the 15-minute default for every
// other valid cron expression. These tests cover each shape the rewrite added.
import { getIngestionIntervalMinutes, nextCollectorHealth, resetCronWarningStateForTests } from "./pipeline-status.js";

let failed = false;
function runTest(name: string, fn: () => void) {
  resetCronWarningStateForTests();
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

const prevCron = process.env.INGESTION_INTERVAL_CRON;
function withCron(expr: string | undefined, fn: () => void) {
  // Assigning `undefined` to a process.env property stringifies it to "undefined"
  // rather than deleting the key — delete explicitly so the "unset" case is real.
  if (expr === undefined) delete process.env.INGESTION_INTERVAL_CRON;
  else process.env.INGESTION_INTERVAL_CRON = expr;
  try {
    fn();
  } finally {
    if (prevCron === undefined) delete process.env.INGESTION_INTERVAL_CRON;
    else process.env.INGESTION_INTERVAL_CRON = prevCron;
  }
}

runTest("unset env var returns the 30-minute default", () => {
  withCron(undefined, () => {
    assert.equal(getIngestionIntervalMinutes(), 30);
  });
});

runTest('"*/30 * * * *" (minute step) returns 30', () => {
  withCron("*/30 * * * *", () => {
    assert.equal(getIngestionIntervalMinutes(), 30);
  });
});

runTest('"*/5 * * * *" (minute step) returns 5', () => {
  withCron("*/5 * * * *", () => {
    assert.equal(getIngestionIntervalMinutes(), 5);
  });
});

runTest('"0 */2 * * *" (hour step) returns 120', () => {
  withCron("0 */2 * * *", () => {
    assert.equal(getIngestionIntervalMinutes(), 120);
  });
});

runTest('"0 * * * *" (hourly) returns 60', () => {
  withCron("0 * * * *", () => {
    assert.equal(getIngestionIntervalMinutes(), 60);
  });
});

runTest('"0,20,40 * * * *" (comma list, even gaps) returns the 20-minute gap', () => {
  withCron("0,20,40 * * * *", () => {
    assert.equal(getIngestionIntervalMinutes(), 20);
  });
});

runTest('"0,10,40 * * * *" (comma list, uneven gaps) returns the smallest gap (10)', () => {
  withCron("0,10,40 * * * *", () => {
    assert.equal(getIngestionIntervalMinutes(), 10);
  });
});

runTest('a comma list given out of order still returns the smallest gap', () => {
  withCron("40,0,10 * * * *", () => {
    assert.equal(getIngestionIntervalMinutes(), 10);
  });
});

runTest("an invalid cron expression falls back to the default and does not throw", () => {
  withCron("not a cron expression", () => {
    assert.equal(getIngestionIntervalMinutes(), 30);
  });
});

runTest("a valid but unrecognized shape (seconds field) falls back to the default", () => {
  withCron("*/10 * * * * *", () => {
    assert.equal(getIngestionIntervalMinutes(), 30);
  });
});

// TASK HEALTH-1 Part 6 (2026-11-17): nextCollectorHealth() is the pure
// per-collector transition recordPipelineRun() uses — a cooldownSkip result
// must carry the prior consecutiveFailures/lastSuccessAt/alerted forward
// completely unchanged, neither resetting (like a success) nor incrementing
// (like a failure).
const PRIOR = {
  consecutiveFailures: { gdelt: 4 },
  lastSuccessAt: { gdelt: "2026-11-17T00:00:00.000Z" },
  alerted: { gdelt: true },
};

runTest("a cooldown skip carries the prior counter forward unchanged — the counter does not change on a skip", () => {
  const next = nextCollectorHealth("gdelt", { ok: true, cooldownSkip: true }, PRIOR, "2026-11-17T06:00:00.000Z");
  assert.equal(next.consecutiveFailures, 4, "must not reset to 0 and must not increment to 5");
  assert.equal(next.lastSuccessAt, "2026-11-17T00:00:00.000Z");
  assert.equal(next.alerted, true);
});

runTest("a cooldown skip with no prior state starts at 0, not 1", () => {
  const next = nextCollectorHealth("gdelt", { ok: true, cooldownSkip: true }, null, "2026-11-17T06:00:00.000Z");
  assert.equal(next.consecutiveFailures, 0);
  assert.equal(next.lastSuccessAt, undefined);
  assert.equal(next.alerted, false);
});

runTest("a real success resets the counter and re-arms the alert, same as before this part", () => {
  const next = nextCollectorHealth("gdelt", { ok: true, fetched: 10 }, PRIOR, "2026-11-17T06:00:00.000Z");
  assert.equal(next.consecutiveFailures, 0);
  assert.equal(next.lastSuccessAt, "2026-11-17T06:00:00.000Z");
  assert.equal(next.alerted, false);
});

runTest("a real failure still increments the counter, same as before this part", () => {
  const next = nextCollectorHealth("gdelt", { ok: false, error: "boom" }, PRIOR, "2026-11-17T06:00:00.000Z");
  assert.equal(next.consecutiveFailures, 5);
  assert.equal(next.lastSuccessAt, "2026-11-17T00:00:00.000Z");
  assert.equal(next.alerted, true);
});

if (failed) process.exitCode = 1;
