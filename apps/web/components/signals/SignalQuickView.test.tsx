import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Signal } from "@blue-beacon-research/shared";

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

type QuickViewModule = typeof import("./SignalQuickView");
let SignalQuickView: QuickViewModule["SignalQuickView"];
let clearQuickViewDetailCache: QuickViewModule["clearQuickViewDetailCache"];

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function baseSignal(overrides: Partial<Signal> = {}): Signal {
  const createdAt = "2026-10-01T00:00:00.000Z";
  return {
    id: "sig-quick-1",
    title: "Strait traffic slows",
    summary: "Tankers are waiting outside the strait.",
    severity: 7,
    confidence: 0.8,
    eventType: "conflict",
    country: "Yemen",
    region: "middle-east",
    sourcesCount: 6,
    commodityImpacts: [],
    currencyPairImpacts: [],
    isBreaking: false,
    isActive: true,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function headline(n: number, domain: string) {
  return {
    title: `Headline ${n}`,
    url: `https://${domain}/story-${n}`,
    sourceLabel: domain,
    domain,
    publishedAt: "2026-10-01T12:00:00.000Z",
  };
}

const sources = [
  headline(1, "reuters.com"),
  headline(2, "reuters.com"),
  headline(3, "bbc.co.uk"),
  headline(4, "dw.com"),
  headline(5, "aljazeera.com"),
  headline(6, "apnews.com"),
];

async function renderDrawer(signal: Signal | null): Promise<{ html: string; root: Root }> {
  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(SignalQuickView, { signal, onClose: () => {} }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return { html: document.body.innerHTML, root };
}

async function main() {
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const text = args.map((part) => (typeof part === "string" ? part : "")).join("\n");
    if (text.includes("not wrapped in act")) return;
    originalError(...args);
  };

  const mod = await import("./SignalQuickView");
  SignalQuickView = mod.SignalQuickView;
  clearQuickViewDetailCache = mod.clearQuickViewDetailCache;

  await runTest("renders the report count and at most five headline links", async () => {
    clearQuickViewDetailCache();
    const calls: string[] = [];
    let seen: AbortSignal | undefined;
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input));
      seen = init?.signal ?? undefined;
      return new Response(JSON.stringify({ sources }), { status: 200 });
    }) as typeof fetch;
    let root: Root | undefined;
    try {
      const signal = baseSignal();
      const rendered = await renderDrawer(signal);
      root = rendered.root;
      const text = visibleText(rendered.html);
      assert.ok(calls.some((url) => url === `/api/signals/${signal.id}`));
      assert.match(text, /6 reports/);
      assert.match(text, /5 unique sources/);
      assert.equal(text.includes("Last updated"), false);
      const links = rendered.html.match(/data-testid="quick-view-headline"/g) ?? [];
      assert.equal(links.length, 5);
      assert.equal(rendered.html.includes('target="_blank"'), true);
      assert.equal(rendered.html.includes('rel="noopener noreferrer"'), true);
      assert.equal(text.includes("Headline 6"), false);
      assert.equal(text.includes("Headline 1"), true);
      assert.equal(rendered.html.includes("w-1/2"), true);
      await act(async () => {
        root?.unmount();
      });
      root = undefined;
      assert.equal(seen?.aborted, true);
    } finally {
      globalThis.fetch = original;
      root?.unmount();
      clearQuickViewDetailCache();
    }
  });

  await runTest("hides Last updated when updatedAt equals createdAt", async () => {
    clearQuickViewDetailCache();
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ sources: [headline(1, "reuters.com")] }), {
        status: 200,
      })) as typeof fetch;
    let root: Root | undefined;
    try {
      const createdAt = "2026-10-01T00:00:00.000Z";
      const signal = baseSignal({
        id: "sig-equal-time",
        sourcesCount: 4,
        createdAt,
        updatedAt: createdAt,
      });
      const rendered = await renderDrawer(signal);
      root = rendered.root;
      const text = visibleText(rendered.html);
      assert.match(text, /4 reports/);
      assert.equal(text.includes("Last updated"), false);
    } finally {
      globalThis.fetch = original;
      root?.unmount();
      clearQuickViewDetailCache();
    }
  });

  await runTest("shows Confidence as a rounded percent, same field/format as the dashboard featured card", async () => {
    clearQuickViewDetailCache();
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ sources: [headline(1, "reuters.com")] }), { status: 200 })) as typeof fetch;
    let root: Root | undefined;
    try {
      const signal = baseSignal({ id: "sig-confidence", confidence: 0.823 });
      const rendered = await renderDrawer(signal);
      root = rendered.root;
      assert.match(rendered.html, /data-testid="quick-view-confidence"[^>]*>\s*82%/);
      const text = visibleText(rendered.html);
      assert.match(text, /Confidence/);
    } finally {
      globalThis.fetch = original;
      root?.unmount();
      clearQuickViewDetailCache();
    }
  });

  await runTest("shows Direction — a single label when every impact agrees, same text as the event page", async () => {
    clearQuickViewDetailCache();
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ sources: [headline(1, "reuters.com")] }), { status: 200 })) as typeof fetch;
    let root: Root | undefined;
    try {
      const signal = baseSignal({
        id: "sig-direction",
        commodityImpacts: [
          { asset: "USOIL", direction: "up", confidence: 0.7 },
          { asset: "UKOIL", direction: "up", confidence: 0.6 },
        ],
      });
      const rendered = await renderDrawer(signal);
      root = rendered.root;
      assert.match(rendered.html, /data-testid="quick-view-direction"/);
      const text = visibleText(rendered.html);
      assert.match(text, /Direction/);
      assert.match(text, /\bUp\b/);
    } finally {
      globalThis.fetch = original;
      root?.unmount();
      clearQuickViewDetailCache();
    }
  });

  await runTest("Direction is per-asset when impacts disagree, and absent with no impacts", async () => {
    clearQuickViewDetailCache();
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ sources: [headline(1, "reuters.com")] }), { status: 200 })) as typeof fetch;
    let root: Root | undefined;
    try {
      const mixed = baseSignal({
        id: "sig-direction-mixed",
        commodityImpacts: [
          { asset: "USOIL", direction: "up", confidence: 0.7 },
          { asset: "GOLD", direction: "down", confidence: 0.6 },
        ],
      });
      const mixedRendered = await renderDrawer(mixed);
      root = mixedRendered.root;
      const mixedText = visibleText(mixedRendered.html);
      assert.match(mixedText, /USOIL Up/);
      assert.match(mixedText, /GOLD Down/);
      await act(async () => {
        root?.unmount();
      });

      const none = baseSignal({ id: "sig-direction-none" });
      const noneRendered = await renderDrawer(none);
      root = noneRendered.root;
      assert.equal(noneRendered.html.includes('data-testid="quick-view-direction"'), false);
    } finally {
      globalThis.fetch = original;
      root?.unmount();
      clearQuickViewDetailCache();
    }
  });

  await runTest("a failed fetch leaves the drawer up without the new lines", async () => {
    clearQuickViewDetailCache();
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response("no", { status: 500 })) as typeof fetch;
    let root: Root | undefined;
    try {
      const signal = baseSignal({ id: "sig-failed" });
      const rendered = await renderDrawer(signal);
      root = rendered.root;
      const text = visibleText(rendered.html);
      assert.match(text, /Strait traffic slows/);
      assert.equal(text.includes("reports"), false);
      assert.equal(text.includes("Headlines"), false);
      assert.equal(text.includes("Last updated"), false);
      assert.equal(rendered.html.includes("w-1/2"), true);
    } finally {
      globalThis.fetch = original;
      root?.unmount();
      clearQuickViewDetailCache();
    }
  });
}

main();
