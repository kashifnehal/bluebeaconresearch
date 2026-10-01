import assert from "node:assert/strict";
import { buildEventCategoryPatch } from "./event-category-patch.js";

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

runTest("existing null + incoming value -> patches event_category", () => {
  assert.deepEqual(
    buildEventCategoryPatch(null, "armed_conflict_security"),
    { event_category: "armed_conflict_security" },
  );
});

runTest("existing undefined + incoming value -> patches event_category", () => {
  assert.deepEqual(
    buildEventCategoryPatch(undefined, "armed_conflict_security"),
    { event_category: "armed_conflict_security" },
  );
});

runTest("existing already set -> never overwritten", () => {
  assert.deepEqual(
    buildEventCategoryPatch("sanctions_trade_policy", "armed_conflict_security"),
    {},
  );
});

runTest("incoming null -> no patch", () => {
  assert.deepEqual(buildEventCategoryPatch(null, null), {});
});

runTest("incoming empty string -> no patch", () => {
  assert.deepEqual(buildEventCategoryPatch(null, ""), {});
});
