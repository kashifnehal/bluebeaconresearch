// Shared linkedom + react-dom/client harness for rendered component tests
// (same setup duplicated per-file in components/signals/SignalQuickView.test.tsx
// and components/layout/Sidebar.test.tsx) — factored out once here because
// TASK UI-ALL adds many new small presentational components that all need it.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { parseHTML } from "linkedom";

declare module "linkedom" {
  export function parseHTML(html: string): { window: any; document: Document };
}

// Same minimal localStorage stand-in as components/layout/Sidebar.test.tsx —
// linkedom doesn't implement it, and zustand's persist middleware (useUIStore)
// and several pages' own localStorage reads need it to exist at all.
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

let initialized = false;

/** Call once per test file/process — see the `initialized` guard below. */
export function setupDom(): Document {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  if (!initialized) {
    const g = globalThis as any;
    for (const key of [
      "window",
      "document",
      "HTMLElement",
      "Element",
      "Node",
      "DocumentFragment",
      "MutationObserver",
    ] as const) {
      Object.defineProperty(g, key, {
        value: key === "window" ? window : key === "document" ? document : (window as any)[key],
        configurable: true,
      });
    }
    const computed = () => ({
      getPropertyValue: () => "",
      contentVisibility: "visible",
      display: "block",
    });
    g.getComputedStyle = computed;
    (window as any).getComputedStyle = computed;
    const raf = (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 0);
    const caf = (id: number) => clearTimeout(id);
    g.requestAnimationFrame = raf;
    g.cancelAnimationFrame = caf;
    (window as any).requestAnimationFrame = raf;
    (window as any).cancelAnimationFrame = caf;
    g.IS_REACT_ACT_ENVIRONMENT = true;
    if (typeof g.self === "undefined") g.self = g;
    if (typeof (window as any).self === "undefined") (window as any).self = window;
    (window as any).localStorage = new MemoryStorage();
    (window as any).sessionStorage = new MemoryStorage();
    initialized = true;
  }
  return document;
}

export async function renderElement(
  document: Document,
  element: ReactElement,
): Promise<{ html: string; root: Root }> {
  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return { html: document.body.innerHTML, root };
}

export function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
