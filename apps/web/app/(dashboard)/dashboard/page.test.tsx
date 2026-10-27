import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { signalPriceMovePct, SignalRowPriceChip, ExportCsvButton } from "./page";
import type { Signal } from "@blue-beacon-research/shared";

// Same linkedom + react-dom/client harness as apps/web/app/(dashboard)/calendar/page.test.tsx
// and components/signals/PulseTiles.test.tsx — see those files for why this setup is needed.

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
// useSignalFeed's scroll-triggered pagination attaches an IntersectionObserver
// to the sentinel div — absent under plain linkedom.
class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
g.IntersectionObserver = FakeIntersectionObserver;
(window as any).IntersectionObserver = FakeIntersectionObserver;

function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

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

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    commodityImpacts: [{ asset: "WTI", direction: "up", confidence: 0.8 }],
    currencyPairImpacts: [],
    ...overrides,
  } as unknown as Signal;
}

runTest("signalPriceMovePct returns null when no asset is associated", () => {
  const move = signalPriceMovePct(signal({ commodityImpacts: [], currencyPairImpacts: [] }), [
    { symbol: "WTI", change_pct_24h: 1.2 },
  ]);
  assert.equal(move, null);
});

runTest("signalPriceMovePct returns null when the price row has no 24h change (never fabricates 0)", () => {
  const move = signalPriceMovePct(signal(), [{ symbol: "WTI" }]);
  assert.equal(move, null);
});

runTest("signalPriceMovePct returns the real pct when present", () => {
  const move = signalPriceMovePct(signal(), [{ symbol: "WTI", change_pct_24h: -2.5 }]);
  assert.deepEqual(move, { asset: "WTI", pct: -2.5 });
});

runTest("SignalRowPriceChip shows an em dash with no associated price", () => {
  const html = renderToStaticMarkup(
    createElement(SignalRowPriceChip, {
      signal: signal({ commodityImpacts: [], currencyPairImpacts: [] }),
      prices: [],
    }),
  );
  assert.equal(visibleText(html), "—");
});

runTest("ExportCsvButton shows the current label and keeps its testid", () => {
  const html = renderToStaticMarkup(createElement(ExportCsvButton, { onClick: () => {}, disabled: false }));
  assert.match(html, /data-testid="export-csv-button"/);
  assert.equal(visibleText(html), "download Export loaded rows (CSV)");
  assert.doesNotMatch(html, /EXPORT CSV\b/);
});

runTest("ExportCsvButton disables when told to, without changing the label", () => {
  const html = renderToStaticMarkup(createElement(ExportCsvButton, { onClick: () => {}, disabled: true }));
  assert.match(html, /disabled=""/);
  assert.equal(visibleText(html), "download Export loaded rows (CSV)");
});

runTest("SignalRowPriceChip shows plain asset/24h/pct text with no hover-only content", () => {
  const html = renderToStaticMarkup(
    createElement(SignalRowPriceChip, {
      signal: signal(),
      prices: [{ symbol: "WTI", change_pct_24h: 3.4 }],
    }),
  );
  assert.equal(visibleText(html), "WTI 24h +3.4%");
  assert.equal(/title=/.test(html), false);
});

async function runAsyncTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Removed from the dashboard home 2026-10-27 — PulseTiles now mounts only on
// the single-asset watchlist page. A rendered mount (not a source-text match)
// is the only way to be sure the tiles' own labels never reach this page's
// output, independent of whether the import/mount happen to still be wired.
void runAsyncTest(
  "dashboard home no longer renders the pulse tiles (removed 2026-10-27)",
  async () => {
    const { AppRouterContext } = await import(
      "next/dist/shared/lib/app-router-context.shared-runtime.js"
    );
    const originalFetch = g.fetch;
    g.fetch = async () => new Response("{}", { status: 200 });
    const fakeRouter = {
      push: () => {},
      replace: () => {},
      back: () => {},
      forward: () => {},
      refresh: () => {},
      prefetch: async () => {},
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { default: DashboardPage } = await import("./page");

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
            createElement(QueryClientProvider, { client }, createElement(DashboardPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

      const text = visibleText(document.body.innerHTML);
      for (const removed of [
        "Signals last 24h",
        "Prior 24h",
        "Change vs prior",
        "Peak hour",
        "Asset direction votes",
      ]) {
        assert.equal(text.includes(removed), false, `expected dashboard home not to render "${removed}"`);
      }
      assert.equal(document.querySelector('[data-testid="pulse-tiles"]'), null);
    } finally {
      await act(async () => root.unmount());
      g.fetch = originalFetch;
    }
  },
);
