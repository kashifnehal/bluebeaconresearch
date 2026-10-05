import assert from "node:assert/strict";
import { can, ENTITLEMENTS, limitFor, type FeatureKey } from "./entitlements";

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

const ALL_KEYS = Object.keys(ENTITLEMENTS) as FeatureKey[];

runTest("gates off: can() allows every key for free and for paid tiers", () => {
  for (const key of ALL_KEYS) {
    assert.equal(can("free", key), true, key);
    assert.equal(can("analyst", key), true, key);
    assert.equal(can("pro", key), true, key);
    assert.equal(can("api", key), true, key);
  }
});

runTest("gates off: limitFor() returns Infinity for numeric keys on every tier", () => {
  for (const key of ALL_KEYS) {
    if (typeof ENTITLEMENTS[key].free === "number") {
      assert.equal(limitFor("free", key), Number.POSITIVE_INFINITY, key);
      assert.equal(limitFor("pro", key), Number.POSITIVE_INFINITY, key);
    }
  }
});

runTest("gates on: can() returns exactly the table's free/paid values", () => {
  for (const key of ALL_KEYS) {
    const expectedFree =
      typeof ENTITLEMENTS[key].free === "number" ? ENTITLEMENTS[key].free > 0 : ENTITLEMENTS[key].free;
    const expectedPaid =
      typeof ENTITLEMENTS[key].paid === "number" ? ENTITLEMENTS[key].paid > 0 : ENTITLEMENTS[key].paid;
    assert.equal(can("free", key, true), expectedFree, key);
    assert.equal(can("pro", key, true), expectedPaid, key);
    assert.equal(can("analyst", key, true), expectedPaid, key);
    assert.equal(can("api", key, true), expectedPaid, key);
  }
});

runTest("gates on: limitFor() returns the table's numeric values, free vs paid differ", () => {
  assert.equal(limitFor("free", "alerts.rules_max", true), 3);
  assert.equal(limitFor("pro", "alerts.rules_max", true), 25);
  assert.equal(limitFor("free", "watchlist.max_symbols", true), 5);
  assert.equal(limitFor("pro", "watchlist.max_symbols", true), 50);
  assert.notEqual(limitFor("free", "alerts.rules_max", true), limitFor("pro", "alerts.rules_max", true));
});

runTest("limitFor() throws for a boolean-only key", () => {
  assert.throws(() => limitFor("free", "alerts.why_matched", true));
});

runTest("analyst, pro, and api all collapse to the paid bucket", () => {
  assert.equal(limitFor("analyst", "alerts.rules_max", true), 25);
  assert.equal(limitFor("pro", "alerts.rules_max", true), 25);
  assert.equal(limitFor("api", "alerts.rules_max", true), 25);
});

console.log("entitlements.test.ts ok");
