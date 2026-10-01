import assert from "node:assert/strict";

import { formatOperationalSummary } from "./status-summary";

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

runTest("formatOperationalSummary reports a partial pass", () => {
  assert.equal(formatOperationalSummary(3, 4), "3 of 4 checks operational");
});

runTest("formatOperationalSummary reports a full pass", () => {
  assert.equal(formatOperationalSummary(4, 4), "4 of 4 checks operational");
});

runTest("formatOperationalSummary handles zero checks without NaN", () => {
  assert.equal(formatOperationalSummary(0, 0), "No checks available");
});
