import assert from "node:assert/strict";
import { computeUnreadAlertCount } from "./NotificationPanel";

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

runTest("counts alerts that are neither server-read nor locally marked read", () => {
  const alerts = [
    { id: "a", is_read: false },
    { id: "b", is_read: true },
    { id: "c" },
  ];
  assert.equal(computeUnreadAlertCount(alerts, {}), 2);
  assert.equal(computeUnreadAlertCount(alerts, { c: true }), 1);
});

runTest("an empty alerts list always counts to 0, even with stale local read state", () => {
  // Regression: the sidebar badge (and /alerts' empty-state line) read this
  // same unreadCount, which is persisted across sessions. A fetch that comes
  // back empty must still zero it out — otherwise a leftover non-zero badge
  // from a previous session sticks forever, with nothing in the inbox to
  // match it.
  assert.equal(computeUnreadAlertCount([], {}), 0);
  assert.equal(computeUnreadAlertCount([], { stale: true }), 0);
});

runTest("marking every alert read locally drops the count to 0 without a refetch", () => {
  const alerts = [{ id: "a", is_read: false }, { id: "b", is_read: false }];
  assert.equal(computeUnreadAlertCount(alerts, { a: true, b: true }), 0);
});
