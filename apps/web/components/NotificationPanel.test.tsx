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

// Regression for the render loop (React error #185) shipped in c5e51f4: writing
// an unchanged unread count must not notify store subscribers, otherwise a
// component that subscribes to the store and writes it in an effect loops forever.
import { useUIStore } from "../store/useUIStore";

runTest("setUnreadCount with an unchanged value does not notify subscribers", () => {
  useUIStore.setState({ unreadCount: 0 });
  let notified = 0;
  const unsubscribe = useUIStore.subscribe(() => {
    notified += 1;
  });
  useUIStore.getState().setUnreadCount(0);
  useUIStore.getState().setUnreadCount(0);
  useUIStore.getState().resetUnread();
  assert.equal(notified, 0);
  useUIStore.getState().setUnreadCount(3);
  assert.equal(notified, 1);
  useUIStore.getState().setUnreadCount(3);
  assert.equal(notified, 1);
  unsubscribe();
  useUIStore.setState({ unreadCount: 0 });
});

runTest("NotificationPanel uses a stable empty array and waits for data before writing the badge", () => {
  // Source-level guard: rendering is not feasible in this runner (next/link).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "NotificationPanel.tsx"), "utf8") as string;
  assert.ok(!/data\?\.alerts \?\? \[\]/.test(src), "fresh [] per render brings the loop back");
  assert.ok(/EMPTY_ALERTS/.test(src));
  assert.ok(/if \(!data\) return;/.test(src));
});
