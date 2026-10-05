import assert from "node:assert/strict";
import { isWithinIntakeWindow, DEFAULT_INTAKE_MAX_AGE_MS } from "./article-age.js";

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

const now = new Date("2026-10-05T12:00:00Z");

runTest("an article published just now is within the window", () => {
  assert.equal(isWithinIntakeWindow(now, now), true);
});

runTest("an article published 23h59m ago is within the default 24h window", () => {
  const publishedAt = new Date(now.getTime() - (24 * 60 * 60 * 1000 - 60_000));
  assert.equal(isWithinIntakeWindow(publishedAt, now), true);
});

runTest("an article published exactly 24h ago is within the window (inclusive)", () => {
  const publishedAt = new Date(now.getTime() - DEFAULT_INTAKE_MAX_AGE_MS);
  assert.equal(isWithinIntakeWindow(publishedAt, now), true);
});

runTest("an article published 24h01m ago is outside the default 24h window", () => {
  const publishedAt = new Date(now.getTime() - (24 * 60 * 60 * 1000 + 60_000));
  assert.equal(isWithinIntakeWindow(publishedAt, now), false);
});

runTest("a future-dated article is within the window (age check only, no future clamp)", () => {
  const publishedAt = new Date(now.getTime() + 60_000);
  assert.equal(isWithinIntakeWindow(publishedAt, now), true);
});

runTest("a custom maxAgeMs overrides the default window", () => {
  const publishedAt = new Date(now.getTime() - 5 * 60 * 60 * 1000); // 5h ago
  assert.equal(isWithinIntakeWindow(publishedAt, now, 4 * 60 * 60 * 1000), false);
  assert.equal(isWithinIntakeWindow(publishedAt, now, 6 * 60 * 60 * 1000), true);
});

if (failed) {
  console.error("\nSome article-age tests failed.");
  process.exit(1);
} else {
  console.log("\nAll article-age tests passed.");
}
