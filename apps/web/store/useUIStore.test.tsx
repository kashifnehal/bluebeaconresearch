import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

declare module "linkedom" {
  export function parseHTML(html: string): { window: any; document: Document };
}

import { parseHTML } from "linkedom";

const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
const g = globalThis as any;
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "DocumentFragment", "MutationObserver"] as const) {
  Object.defineProperty(g, key, {
    value: key === "window" ? window : key === "document" ? document : (window as any)[key],
    configurable: true,
  });
}
const computed = () => ({ getPropertyValue: () => "", contentVisibility: "visible", display: "block" });
g.getComputedStyle = computed;
(window as any).getComputedStyle = computed;
const raf = (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 0);
const caf = (id: number) => clearTimeout(id);
g.requestAnimationFrame = raf;
g.cancelAnimationFrame = caf;
(window as any).requestAnimationFrame = raf;
(window as any).cancelAnimationFrame = caf;
g.IS_REACT_ACT_ENVIRONMENT = true;

g.fetch = async () =>
  new Response(JSON.stringify({ alerts: [] }), { status: 200 });

// zustand's persist middleware reads `window.localStorage` at store-creation
// time (see zustand/middleware persistImpl default options), so this mock
// must be in place on `window` before store/useUIStore.ts is imported below.
class MemoryStorage {
  private store = new Map<string, string>();
  lastSetValue: string | undefined;
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
    this.lastSetValue = value;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}
const memoryStorage = new MemoryStorage();
(window as any).localStorage = memoryStorage;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  const { useUIStore } = await import("./useUIStore");
  const { NotificationPanel } = await import("../components/NotificationPanel");

  await runTest(
    "rehydrate forces the six panel/badge fields back to their defaults even when a stale blob has them true",
    async () => {
      memoryStorage.setItem(
        "blue-beacon-ui",
        JSON.stringify({
          state: {
            notifOpen: true,
            helpOpen: true,
            mobileSidebarOpen: true,
            commandPaletteOpen: true,
            notificationConnectOpen: true,
            unreadCount: 7,
            compactMode: true,
          },
          version: 0,
        }),
      );

      await useUIStore.persist.rehydrate();

      const state = useUIStore.getState();
      assert.equal(state.notifOpen, false);
      assert.equal(state.helpOpen, false);
      assert.equal(state.mobileSidebarOpen, false);
      assert.equal(state.commandPaletteOpen, false);
      assert.equal(state.notificationConnectOpen, false);
      assert.equal(state.unreadCount, 0);
      assert.equal(state.compactMode, true);
    },
  );

  await runTest("NotificationPanel renders nothing when notifOpen is false, and at most 4 times", async () => {
    let renderCount = 0;
    function CountingPanel() {
      renderCount += 1;
      return createElement(NotificationPanel);
    }

    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await act(async () => {
        root.render(createElement(QueryClientProvider, { client }, createElement(CountingPanel)));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      assert.equal(document.body.innerHTML.includes("Recent Alerts"), false);
      assert.equal(document.querySelector('[class*="fixed inset-0 z-50"]'), null);
      assert.ok(renderCount <= 4, `expected at most 4 renders, got ${renderCount}`);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  await runTest("setNotifOpen(true) writes to localStorage without a notifOpen key", async () => {
    useUIStore.getState().setNotifOpen(true);
    assert.equal(useUIStore.getState().notifOpen, true);
    const written = memoryStorage.lastSetValue ?? "";
    assert.equal(written.includes("notifOpen"), false);
    // Reset so this test's write doesn't leak into any later test in this file.
    useUIStore.getState().setNotifOpen(false);
  });
}

void main();
