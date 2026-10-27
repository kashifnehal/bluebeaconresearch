// Full render coverage for TASK UI-ALL Part 6a/6b/6c on the dashboard page.
// Unlike WatchlistClient/ArchiveClient, this page uses no next/navigation
// hook at all (useSignalFeed/useMyPreferences/useUIStore only), so the real
// component tree renders directly under a QueryClientProvider with fetch
// mocked and a no-op IntersectionObserver stub for the infinite-scroll
// sentinel — no router context providers needed.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { setupDom, renderElement } from "@/lib/test-render";
import DashboardPage from "./page";

const document = setupDom();

class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;
(globalThis as any).window.IntersectionObserver = FakeIntersectionObserver;

function click(el: Element) {
  const event = new (globalThis as any).window.Event("click", { bubbles: true });
  el.dispatchEvent(event);
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

function makeSignal(i: number) {
  const now = new Date(Date.now() - i * 3_600_000).toISOString();
  return {
    id: `sig-${i}`,
    title: `Signal ${i}`,
    summary: "summary",
    severity: 5,
    confidence: 0.6,
    eventType: "conflict",
    country: "Yemen",
    region: "middle-east",
    sourcesCount: 2,
    commodityImpacts: [],
    currencyPairImpacts: [],
    isBreaking: false,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    eventDate: now,
  };
}

async function renderDashboard() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/signals/source-stats")) {
      return new Response(JSON.stringify({ sourcesLast24h: 12 }), { status: 200 });
    }
    if (url.startsWith("/api/signals")) {
      const signals = Array.from({ length: 5 }, (_, i) => makeSignal(i));
      return new Response(JSON.stringify({ signals, total: signals.length }), { status: 200 });
    }
    if (url.startsWith("/api/prices")) {
      return new Response(JSON.stringify({ prices: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  const client = new QueryClient();
  const { root } = await renderElement(
    document,
    createElement(QueryClientProvider, { client }, createElement(DashboardPage)),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return { root, client, restoreFetch: () => (globalThis.fetch = original) };
}

async function main() {
  await runTest("renders inside page-shell, wide, with no h-screen/overflow-y-auto on the root", async () => {
    const { root, client, restoreFetch } = await renderDashboard();
    try {
      const html = document.body.innerHTML;
      assert.match(html, /data-testid="page-shell"/);
      assert.match(html, /max-w-\[1440px\]/);
      assert.doesNotMatch(html, /h-screen/);
      // The aside keeps its own overflow-y-auto (unchanged); only the old
      // "flex-1 overflow-y-auto" main-content scroll wrapper is removed.
      assert.doesNotMatch(html, /flex-1 overflow-y-auto/);
      const h1s = html.match(/<h1[^>]*>/g) ?? [];
      assert.equal(h1s.length, 1);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("the Market & Intelligence aside is present in Cards view, sticky", async () => {
    const { root, client, restoreFetch } = await renderDashboard();
    try {
      const html = document.body.innerHTML;
      assert.match(html, /MARKET &amp; INTELLIGENCE/);
      assert.match(html, /sticky top-16/);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("switching to Table view hides the aside", async () => {
    const { root, client, restoreFetch } = await renderDashboard();
    try {
      const tableButton = document.querySelector('[data-testid="feed-view-table"]');
      assert.ok(tableButton, "expected the Table view toggle button");
      await act(async () => click(tableButton!));
      const html = document.body.innerHTML;
      assert.doesNotMatch(html, /MARKET &amp; INTELLIGENCE/);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });
}

main();
