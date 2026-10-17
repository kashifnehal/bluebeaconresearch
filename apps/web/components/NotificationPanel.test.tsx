import assert from "node:assert/strict";
import { computeUnreadAlertCount, useSyncUnreadBadge } from "./NotificationPanel";

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
  // Source-level guard kept alongside the render test below.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "NotificationPanel.tsx"), "utf8") as string;
  assert.ok(!/data\?\.alerts \?\? \[\]/.test(src), "fresh [] per render brings the loop back");
  assert.ok(/EMPTY_ALERTS/.test(src));
  assert.ok(/if \(!data\) return;/.test(src));
  assert.ok(/export function useSyncUnreadBadge/.test(src));
});

declare module "linkedom" {
  export function parseHTML(html: string): { window: any; document: Document };
}

import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";

const { window: domWindow, document } = parseHTML("<!doctype html><html><body></body></html>");
const g = globalThis as any;
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "DocumentFragment", "MutationObserver"] as const) {
  Object.defineProperty(g, key, {
    value: key === "window" ? domWindow : key === "document" ? document : (domWindow as any)[key],
    configurable: true,
  });
}
g.IS_REACT_ACT_ENVIRONMENT = true;

const MAX_RENDERS = 4;

async function renderBadge(
  data: { alerts: { id: string; is_read?: boolean }[] } | undefined,
  readItems: Record<string, boolean>,
): Promise<{ renders: number; count: string }> {
  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const renders = { n: 0 };
  function Probe() {
    renders.n += 1;
    if (renders.n > MAX_RENDERS) {
      throw new Error(`badge probe rendered ${renders.n} times`);
    }
    useSyncUnreadBadge(data, readItems);
    const count = useUIStore((s) => s.unreadCount);
    return createElement("span", { "data-testid": "badge-count" }, String(count));
  }
  await act(async () => {
    root.render(createElement(Probe));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const count = document.querySelector("[data-testid=badge-count]")?.textContent ?? "";
  const n = renders.n;
  await act(async () => {
    root.unmount();
  });
  return { renders: n, count };
}

async function runRender(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

void (async () => {
  const readItems = {};
  await runRender("empty alerts settle the badge without a render loop", async () => {
    useUIStore.setState({ unreadCount: 5 });
    const result = await renderBadge({ alerts: [] }, readItems);
    assert.equal(result.count, "0");
    assert.ok(result.renders <= MAX_RENDERS, `rendered ${result.renders}`);
  });
  await runRender("undefined data does not write the badge or loop", async () => {
    useUIStore.setState({ unreadCount: 4 });
    const result = await renderBadge(undefined, readItems);
    assert.equal(result.count, "4");
    assert.ok(result.renders <= MAX_RENDERS, `rendered ${result.renders}`);
  });
  await runRender("three unread alerts set the badge without a render loop", async () => {
    useUIStore.setState({ unreadCount: 0 });
    const result = await renderBadge(
      {
        alerts: [
          { id: "a", is_read: false },
          { id: "b", is_read: false },
          { id: "c", is_read: false },
        ],
      },
      readItems,
    );
    assert.equal(result.count, "3");
    assert.ok(result.renders <= MAX_RENDERS, `rendered ${result.renders}`);
    useUIStore.setState({ unreadCount: 0 });
  });
})();
