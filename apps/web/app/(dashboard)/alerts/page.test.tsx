import assert from "node:assert/strict";

import { alertsEmptyStateHeading } from "./page";

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

runTest("0 rules, 0 unread shows the plain 'no rules configured' heading", () => {
  assert.equal(alertsEmptyStateHeading(0), "No alert rules configured");
});

runTest("0 rules, unread alerts present points the user at their inbox", () => {
  assert.equal(
    alertsEmptyStateHeading(4),
    "No alert rules yet. 4 unread alerts in your inbox.",
  );
});

runTest("0 rules, exactly 1 unread alert uses the singular", () => {
  assert.equal(
    alertsEmptyStateHeading(1),
    "No alert rules yet. 1 unread alert in your inbox.",
  );
});
