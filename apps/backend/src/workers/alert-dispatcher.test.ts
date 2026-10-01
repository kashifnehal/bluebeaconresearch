import assert from "node:assert/strict";

// alert-dispatcher.ts builds a Supabase admin client at module scope
// (`getSupabaseAdmin()`), which requires these to be set. A plain top-level
// import would be hoisted ahead of any process.env assignment in this file
// (standard ESM semantics), so the module is loaded dynamically after the
// env vars are set instead.
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-role-key";

const { isInQuietHours } = await import("./alert-dispatcher.js");

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
