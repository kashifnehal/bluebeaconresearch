// Full render coverage for the Part of TASK UI-ALL that touches WatchlistClient's
// JSX directly (the PageShell swap + the new Sort toolbar): WatchlistClient.test.tsx
// documents that useSearchParams throws outside a mounted App Router, but Next
// exposes SearchParamsContext precisely so a plain Provider can satisfy that hook
// in a non-router test harness — so unlike that file, this one renders the real
// component tree instead of only asserting against extracted pure functions/source text.
// IMPORTANT: WatchlistClient (via its Add-asset dialog) transitively imports
// @base-ui/react/dialog, whose Portal resolves `document` at module-evaluation
// time. A static top-level import of WatchlistClient would therefore capture
// the real Node document, not the linkedom one `setupDom()` installs below —
// the Dialog's open/close transition would then silently render into the
// wrong document and never appear in this test's `document.body`. Same fix
// CommandPalette.test.tsx already uses: import WatchlistClient dynamically,
// inside main(), after setupDom() has replaced the document/window globals.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { setupDom, renderElement } from "@/lib/test-render";
import type { WatchlistClient as WatchlistClientType } from "./WatchlistClient";

const document = setupDom();

let WatchlistClient: typeof WatchlistClientType;
let WATCHLIST_ASSETS: { symbol: string; label: string }[];
let DEFAULT_WATCHLIST: string[];

function click(el: Element) {
  const event = new (globalThis as any).window.Event("click", { bubbles: true });
  el.dispatchEvent(event);
}

// Same workaround components/CommandPalette.test.tsx documents: dispatching
// a native "input"/"change" DOM event on a text <input> silently no-ops in
// this linkedom + react-dom/client combination (React's ChangeEventPlugin
// can't find the fiber from the dispatched event). Calling the input's own
// onChange prop directly (read off the fiber's __reactProps$* key) still
// exercises the real handler and its state update.
function typeInto(el: Element, value: string) {
  const propsKey = Object.getOwnPropertyNames(el).find((k) => k.startsWith("__reactProps$"))!;
  (el as any)[propsKey].onChange({ target: { value } });
}

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
  ({ WatchlistClient, WATCHLIST_ASSETS, DEFAULT_WATCHLIST } = await import("./WatchlistClient"));

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

  await runTest("Add asset dialog: ticking two assets and 'Add selected (2)' adds exactly those two", async () => {
    const { root, client, restoreFetch } = await renderWatchlist({});
    try {
      const addButton = document.querySelector('[aria-label="Add asset to watchlist"]');
      assert.ok(addButton, "expected the + Add Asset button");
      await act(async () => click(addButton!));

      const options = [...document.querySelectorAll('[data-testid="watchlist-add-option"]')] as any[];
      assert.ok(options.length >= 2, "expected at least two addable assets");
      const labelsBefore = options.slice(0, 2).map((el) => el.closest("label")?.textContent);

      options[0].checked = true;
      await act(async () => click(options[0]));
      const refreshed = [...document.querySelectorAll('[data-testid="watchlist-add-option"]')] as any[];
      refreshed[1].checked = true;
      await act(async () => click(refreshed[1]));

      const submit = document.querySelector('[data-testid="watchlist-add-submit"]');
      assert.ok(submit);
      assert.match(submit!.textContent ?? "", /Add selected \(2\)/);
      await act(async () => click(submit!));

      // Dialog closes and both newly-added assets now have a watchlist card.
      assert.doesNotMatch(document.body.innerHTML, /data-testid="watchlist-add-submit"/);
      for (const label of labelsBefore) {
        assert.ok(label, "expected a label for the checked option");
        const name = label!.replace(/^\s*/, "").trim();
        assert.ok(
          document.body.innerHTML.includes(`Open ${name} drill-down`),
          `expected a new card for ${name}`,
        );
      }
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("Add asset dialog: search filters the option list", async () => {
    const { root, client, restoreFetch } = await renderWatchlist({});
    try {
      const addButton = document.querySelector('[aria-label="Add asset to watchlist"]');
      assert.ok(addButton);
      await act(async () => click(addButton!));

      const search = document.querySelector('[data-testid="watchlist-add-search"]') as any;
      assert.ok(search);
      const before = document.querySelectorAll('[data-testid="watchlist-add-option"]').length;
      assert.ok(before > 1, "expected multiple addable assets before filtering");

      await act(async () => typeInto(search, "cocoa"));
      const after = [...document.querySelectorAll('[data-testid="watchlist-add-option"]')] as any[];
      assert.ok(after.length >= 1 && after.length < before);
      assert.ok(
        after.every((el) => /cocoa/i.test(el.closest("label")?.textContent ?? "")),
        "expected only Cocoa to remain after filtering",
      );
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("Add asset dialog: 'Select all shown' ticks only the currently-filtered options", async () => {
    const { root, client, restoreFetch } = await renderWatchlist({});
    try {
      const addButton = document.querySelector('[aria-label="Add asset to watchlist"]');
      assert.ok(addButton);
      await act(async () => click(addButton!));

      // "oil" matches exactly two of the addable (non-watchlisted) assets:
      // "Vegetable Oils" and "Soybeans and Soy Oil" (the priced "Heating Oil
      // / ULSD" also matches "oil" but is already in the default watchlist,
      // so it's never in `available` to begin with).
      const search = document.querySelector('[data-testid="watchlist-add-search"]') as any;
      await act(async () => typeInto(search, "oil"));
      const shownCount = document.querySelectorAll('[data-testid="watchlist-add-option"]').length;
      assert.equal(shownCount, 2);

      const selectAllShown = document.querySelector('[data-testid="watchlist-add-select-all"]') as any;
      assert.ok(selectAllShown);
      selectAllShown.checked = true;
      await act(async () => click(selectAllShown));

      const submit = document.querySelector('[data-testid="watchlist-add-submit"]');
      assert.match(submit!.textContent ?? "", new RegExp(`Add selected \\(${shownCount}\\)`));
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });
}

main();
