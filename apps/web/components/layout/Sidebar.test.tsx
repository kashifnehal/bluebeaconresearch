import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

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

const dir = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(dir, "Sidebar.tsx"), "utf8");

runTest("unread count badge carries an 'unread alerts' aria-label and title", () => {
  const badgeMatch = source.match(/\{item\.showBadge && unreadCount > 0 && \(([\s\S]*?)\)\}/);
  assert.ok(badgeMatch, "expected to find the unread-count badge block");
  const badgeBlock = badgeMatch![1];
  assert.match(badgeBlock, /aria-label="unread alerts"/);
  assert.match(badgeBlock, /title="unread alerts"/);
});

// --- Rendered test: Sidebar shows "WEEK AHEAD", not "CALENDAR" ---
//
// Same linkedom + react-dom/client harness as components/signals/SignalQuickView.test.tsx
// and components/CommandPalette.test.tsx. Sidebar needs both next/navigation's
// usePathname (PathnameContext, exported from next's hooks-client-context
// shared runtime) and useRouter (AppRouterContext, same as CommandPalette's
// test) satisfied via real Next.js context providers, not mocks.

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
// next/link's prefetch-on-visible wiring calls requestIdleCallback, which
// references the browser global `self` — absent under plain linkedom.
if (typeof g.self === "undefined") g.self = g;
if (typeof (window as any).self === "undefined") (window as any).self = window;

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}
(window as any).localStorage = new MemoryStorage();

async function runAsync(name: string, fn: () => Promise<void>) {
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
  await runAsync('Sidebar shows "WEEK AHEAD", not "CALENDAR"', async () => {
    const { AppRouterContext } = await import(
      "next/dist/shared/lib/app-router-context.shared-runtime.js"
    );
    const { PathnameContext } = await import(
      "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
    );
    const { Sidebar } = await import("./Sidebar");

    const fakeRouter = {
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: async () => {},
    };

    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          createElement(
            AppRouterContext.Provider,
            { value: fakeRouter },
            createElement(PathnameContext.Provider, { value: "/calendar" }, createElement(Sidebar)),
          ),
        );
      });
      const text = document.body.textContent ?? "";
      assert.match(text, /WEEK AHEAD/);
      assert.doesNotMatch(text, /\bCALENDAR\b/);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

main();
