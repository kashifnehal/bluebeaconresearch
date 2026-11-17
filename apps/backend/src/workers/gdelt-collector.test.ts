import assert from "node:assert/strict";
import type { GdeltCooldownState } from "./gdelt-collector.js";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

// TASK HEALTH-1 Part 6 (2026-11-17) — the post-429 cooldown. isGdeltCoolingDown/
// startGdeltCooldown/clearGdeltCooldown/gdelt429RetryDelayMs are pure (an
// injected `now` and an injected state object, no module-singleton mutation
// needed in tests), so these don't touch axios, Supabase or the network at
// all. runGdeltCollectorOnce() itself IS exercised below, but only for the
// "already cooling down" branch, which returns before any axios call is
// made — the real post-cooldown re-fetch path is not re-verified here since
// that would mean an actual outbound call to api.gdeltproject.org; the pure
// isGdeltCoolingDown() tests below prove the exact decision
// runGdeltCollectorOnce() makes at that boundary.
const {
  runGdeltCollectorOnce,
  isGdeltCoolingDown,
  startGdeltCooldown,
  clearGdeltCooldown,
  gdelt429RetryDelayMs,
  __resetGdeltCooldownForTests,
} = await import("./gdelt-collector.js");

let failed = false;
function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✔ ${name}`))
    .catch((err) => {
      failed = true;
      console.error(`✖ ${name}`);
      console.error(err);
    });
}

async function main() {
  await runTest("a fresh state is not cooling down", () => {
    const state: GdeltCooldownState = { cooldownUntilMs: null };
    assert.equal(isGdeltCoolingDown(1_000, state), false);
  });

  await runTest("startGdeltCooldown makes isGdeltCoolingDown true until the cooldown elapses", () => {
    const state: GdeltCooldownState = { cooldownUntilMs: null };
    const start = 1_800_000_000_000;
    startGdeltCooldown(start, 90, state);
    assert.equal(isGdeltCoolingDown(start, state), true, "true the instant the cooldown starts");
    assert.equal(isGdeltCoolingDown(start + 89 * 60_000, state), true, "still true 1 minute before it ends");
    assert.equal(isGdeltCoolingDown(start + 90 * 60_000, state), false, "false once the cooldown has fully elapsed");
    assert.equal(isGdeltCoolingDown(start + 91 * 60_000, state), false, "stays false after that");
  });

  await runTest("clearGdeltCooldown ends an active cooldown immediately", () => {
    const state: GdeltCooldownState = { cooldownUntilMs: null };
    const now = 1_800_000_000_000;
    startGdeltCooldown(now, 90, state);
    assert.equal(isGdeltCoolingDown(now, state), true);
    clearGdeltCooldown(state);
    assert.equal(isGdeltCoolingDown(now, state), false);
  });

  await runTest("gdelt429RetryDelayMs honours a valid Retry-After header, converted to ms", () => {
    assert.equal(gdelt429RetryDelayMs("30", 99_999), 30_000);
  });

  await runTest("gdelt429RetryDelayMs caps Retry-After at 120 seconds", () => {
    assert.equal(gdelt429RetryDelayMs("600", 99_999), 120_000);
  });

  await runTest("gdelt429RetryDelayMs falls back when Retry-After is missing/invalid/zero", () => {
    assert.equal(gdelt429RetryDelayMs(undefined, 5_000), 5_000);
    assert.equal(gdelt429RetryDelayMs("not-a-number", 5_000), 5_000);
    assert.equal(gdelt429RetryDelayMs("0", 5_000), 5_000);
    assert.equal(gdelt429RetryDelayMs("-10", 5_000), 5_000);
  });

  await runTest(
    "runGdeltCollectorOnce skips the whole cycle (no HTTP call) while inside an active cooldown",
    async () => {
      __resetGdeltCooldownForTests();
      const now = 1_800_000_000_000;
      startGdeltCooldown(now, 90);
      const startedAt = Date.now();
      const result = await runGdeltCollectorOnce(now);
      const elapsedMs = Date.now() - startedAt;
      assert.equal(result.ok, true);
      assert.equal((result as any).cooldownSkip, true);
      assert.equal(result.fetched, 0);
      assert.equal(result.inserted, 0);
      // The real fetch has a 40s timeout; a skip that actually reached it would
      // take seconds, not milliseconds. This is the practical proof (short of
      // mocking axios, which nothing in this file currently does) that the
      // early return fires before any network call.
      assert.ok(elapsedMs < 2_000, `expected an instant skip, took ${elapsedMs}ms`);
      __resetGdeltCooldownForTests();
    },
  );
}

main().then(() => {
  if (failed) process.exitCode = 1;
});
