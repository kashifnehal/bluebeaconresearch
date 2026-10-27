// Full render coverage for the Part of TASK UI-ALL that touches WatchlistClient's
// JSX directly (the PageShell swap + the new Sort toolbar): WatchlistClient.test.tsx
// documents that useSearchParams throws outside a mounted App Router, but Next
// exposes SearchParamsContext precisely so a plain Provider can satisfy that hook
// in a non-router test harness — so unlike that file, this one renders the real
// component tree instead of only asserting against extracted pure functions/source text.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { setupDom, renderElement } from "@/lib/test-render";
import { WatchlistClient, WATCHLIST_ASSETS, DEFAULT_WATCHLIST } from "./WatchlistClient";

const document = setupDom();

function changeSelect(select: Element, value: string) {
  const options = [...select.querySelectorAll("option")] as any[];
  const index = options.findIndex((o) => o.getAttribute("value") === value);
  options.forEach((o, i) => {
    if (i === index) o.setAttribute("selected", "");
    else o.removeAttribute("selected");
  });
  (select as any).selectedIndex = index;
  const event = new (globalThis as any).window.Event("change", { bubbles: true });
  select.dispatchEvent(event);
}

function openOrder(html: string): string[] {
  return [...html.matchAll(/Open ([^<]+?) drill-down/g)].map((m) => m[1]);
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

async function renderWatchlist(pricesBySymbol: Record<string, { change_pct_24h: number }>) {
  const { SearchParamsContext } = await import(
    "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
  );
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/prices") && !url.includes("/history")) {
      const prices = Object.entries(pricesBySymbol).map(([symbol, v]) => ({ symbol, price: 1, ...v }));
      return new Response(JSON.stringify({ prices }), { status: 200 });
    }
    // Sparkline per-card history requests — not under test here.
    return new Response(JSON.stringify({ points: [] }), { status: 200 });
  }) as typeof fetch;

  const client = new QueryClient();
  const { root } = await renderElement(
    document,
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        SearchParamsContext.Provider,
        { value: new URLSearchParams() },
        createElement(WatchlistClient),
      ),
    ),
  );
  // Let the hydration effect (localStorage read -> setWatch -> setHydrated) and
  // the subsequent prices query settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return {
    root,
    client,
    get html() {
      return document.body.innerHTML;
    },
    restoreFetch: () => (globalThis.fetch = original),
  };
}

async function main() {
  await runTest("renders inside page-shell, wide, with no md:fixed element", async () => {
    const { html, root, client, restoreFetch } = await renderWatchlist({});
    try {
      assert.match(html, /data-testid="page-shell"/);
      assert.match(html, /max-w-\[1440px\]/);
      assert.doesNotMatch(html, /md:fixed/);
      assert.match(document.body.innerHTML, /aria-label="Sort watchlist"/);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("default sort ('Added order') keeps the seeded DEFAULT_WATCHLIST order", async () => {
    const { html, root, client, restoreFetch } = await renderWatchlist({});
    try {
      const expectedLabels = DEFAULT_WATCHLIST.map(
        (sym) => WATCHLIST_ASSETS.find((a) => a.symbol === sym)?.label ?? sym,
      );
      assert.deepEqual(openOrder(html), expectedLabels);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("choosing 'Name A to Z' reorders the cards alphabetically by label", async () => {
    const { root, client, restoreFetch } = await renderWatchlist({});
    try {
      const select = document.querySelector('select[aria-label="Sort watchlist"]');
      assert.ok(select, "expected the Sort watchlist select");
      await act(async () => changeSelect(select!, "name"));

      const expectedLabels = [...DEFAULT_WATCHLIST]
        .map((sym) => WATCHLIST_ASSETS.find((a) => a.symbol === sym)?.label ?? sym)
        .sort((a, b) => a.localeCompare(b));
      assert.deepEqual(openOrder(document.body.innerHTML), expectedLabels);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("choosing '24h change' sorts high to low and puts a symbol with no price last", async () => {
    const withPrice = DEFAULT_WATCHLIST.slice(0, -1);
    const missingPriceSymbol = DEFAULT_WATCHLIST[DEFAULT_WATCHLIST.length - 1];
    const pricesBySymbol: Record<string, { change_pct_24h: number }> = {};
    withPrice.forEach((sym, i) => {
      pricesBySymbol[sym] = { change_pct_24h: i - withPrice.length / 2 };
    });
    const { root, client, restoreFetch } = await renderWatchlist(pricesBySymbol);
    try {
      const select = document.querySelector('select[aria-label="Sort watchlist"]');
      assert.ok(select);
      await act(async () => changeSelect(select!, "change"));

      const sortedPriced = [...withPrice].sort(
        (a, b) => pricesBySymbol[b].change_pct_24h - pricesBySymbol[a].change_pct_24h,
      );
      const expectedLabels = [...sortedPriced, missingPriceSymbol].map(
        (sym) => WATCHLIST_ASSETS.find((a) => a.symbol === sym)?.label ?? sym,
      );
      assert.deepEqual(openOrder(document.body.innerHTML), expectedLabels);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });
}

main();
