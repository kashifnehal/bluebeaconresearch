import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

// TASK HEALTH-1 Part 7 (2026-11-17) — the future-dated-item notice's once-
// per-feed-per-hour throttle. logFutureDatedItemOnce is pure given an
// injected `now`, so this doesn't touch rss-parser, Supabase or the network.
// The clamping math itself (CLOCK_SKEW_ALLOWANCE_MS comparison, inline in
// the main collector loop) is unchanged by this part and has no existing
// test harness to extend — runRssCollectorOnce isn't unit-testable without
// mocking rss-parser for every configured feed, which nothing in this repo
// currently does.
const { logFutureDatedItemOnce, __resetFutureClampLogStateForTests } = await import("./rss-collector.js");

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

function captureLog(fn: () => void): string[] {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.join(" "));
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines;
}

runTest("the first call for a feed logs", () => {
  __resetFutureClampLogStateForTests();
  const lines = captureLog(() => logFutureDatedItemOnce("Reserve Bank of India", 1_800_000_000_000));
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /Reserve Bank of India.*future-dated item, clamping to now/);
});

runTest("a second call for the same feed inside the hour does not log again", () => {
  __resetFutureClampLogStateForTests();
  const now = 1_800_000_000_000;
  logFutureDatedItemOnce("Reserve Bank of India", now);
  const lines = captureLog(() => logFutureDatedItemOnce("Reserve Bank of India", now + 30 * 60_000));
  assert.equal(lines.length, 0, "must not log again inside the same hour");
});

runTest("a call one hour later logs again", () => {
  __resetFutureClampLogStateForTests();
  const now = 1_800_000_000_000;
  logFutureDatedItemOnce("Reserve Bank of India", now);
  const lines = captureLog(() => logFutureDatedItemOnce("Reserve Bank of India", now + 60 * 60_000));
  assert.equal(lines.length, 1, "must log again once a full hour has passed");
});

runTest("different feeds are throttled independently", () => {
  __resetFutureClampLogStateForTests();
  const now = 1_800_000_000_000;
  logFutureDatedItemOnce("Reserve Bank of India", now);
  const lines = captureLog(() => logFutureDatedItemOnce("BBC World", now + 1_000));
  assert.equal(lines.length, 1, "a different feed's first occurrence must still log");
});

if (failed) process.exitCode = 1;
