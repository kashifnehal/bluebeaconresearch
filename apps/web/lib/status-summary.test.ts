import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { formatOperationalSummary, publicStatusName } from "./status-summary";

const here = dirname(fileURLToPath(import.meta.url));

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

runTest("public status names stay the existing checks", () => {
  assert.equal(publicStatusName("Alert Delivery"), "Alerts");
  assert.equal(publicStatusName("Price History"), "Prices");
  assert.equal(publicStatusName("Intelligence Feed"), "Intelligence Feed");
  assert.equal(publicStatusName("Global Map"), "Global Map");
  assert.equal(publicStatusName("Data Pipeline"), "Data Pipeline");
  assert.equal(publicStatusName("Classifier"), "Classifier");
});

runTest("public status page renders a name and a state, not the detail string", () => {
  const src = readFileSync(join(here, "../app/status/page.tsx"), "utf8");
  assert.equal(src.includes("sys.detail"), false);
  assert.equal(src.includes("publicStatusName"), true);
  assert.equal(src.includes("Real-time"), false);
});
