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

function makeSignal(i: number, overrides: Partial<Record<string, unknown>> = {}) {
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
    ...overrides,
  };
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

async function renderDashboard(signals = Array.from({ length: 5 }, (_, i) => makeSignal(i))) {
  // This file shares one `document`/localStorage across tests (setupDom is
  // called once per module) — clear persisted view/sort state so each test
  // starts from the real first-visit defaults instead of a previous test's.
  try {
    (globalThis as any).window.localStorage.removeItem("bbr_feed_view_mode");
    (globalThis as any).window.localStorage.removeItem("bbr.feed.sort");
    (globalThis as any).window.localStorage.removeItem("bbr.feed.hideSummaries");
  } catch {
    // ignore
  }
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/signals/source-stats")) {
      return new Response(JSON.stringify({ sourcesLast24h: 12 }), { status: 200 });
    }
    if (url.startsWith("/api/signals")) {
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

  await runTest("one combined status line holds data-as-of, coverage-line, window-expanded-line in order", async () => {
    const { root, client, restoreFetch } = await renderDashboard();
    try {
      const html = document.body.innerHTML;
      const order = [
        html.indexOf('data-testid="data-as-of"'),
        html.indexOf('data-testid="coverage-line"'),
      ];
      assert.ok(order[0] > -1 && order[1] > -1, "expected both data-as-of and coverage-line");
      assert.ok(order[0] < order[1]);
      // Exactly one data-as-of line (the old header duplicated "Data as of" —
      // once above PulseTiles, once under the subhead; PulseTiles itself was
      // already removed from this page before this task, see PART 6a note).
      const dataAsOfCount = html.match(/data-testid="data-as-of"/g)?.length ?? 0;
      assert.equal(dataAsOfCount, 1);
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

  await runTest("Sort: 'Newest first' reorders the stream and shows feed-sort-note; 'Relevance' restores order", async () => {
    const signals = [
      makeSignal(0, { id: "a", severity: 3, eventDate: "2026-10-01T00:00:00.000Z" }),
      makeSignal(1, { id: "b", severity: 9, eventDate: "2026-10-05T00:00:00.000Z" }),
      makeSignal(2, { id: "c", severity: 6, eventDate: "2026-10-10T00:00:00.000Z" }),
    ];
    const { root, client, restoreFetch } = await renderDashboard(signals);
    try {
      const sortSelect = document.querySelector('select[aria-label="Sort loaded signals"]');
      assert.ok(sortSelect, "expected the stream Sort select");
      assert.doesNotMatch(document.body.innerHTML, /data-testid="feed-sort-note"/);

      // Exact-text-node match (">Signal N<") so the row checkbox's sr-only
      // "Select Signal N" label (a substring match otherwise) isn't double-counted.
      const streamOrder = () => {
        const html = document.body.innerHTML;
        const start = html.indexOf("Recent Signal Stream");
        return [...html.slice(start).matchAll(/>Signal (\d)</g)].map((m) => m[1]);
      };

      await act(async () => changeSelect(sortSelect!, "newest"));
      assert.deepEqual(streamOrder(), ["2", "1", "0"]);
      assert.match(document.body.innerHTML, /data-testid="feed-sort-note"/);

      await act(async () => changeSelect(sortSelect!, "relevance"));
      assert.deepEqual(streamOrder(), ["0", "1", "2"]);
      assert.doesNotMatch(document.body.innerHTML, /data-testid="feed-sort-note"/);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("Active filters: removing a chip resets only that field; Clear all resets every field", async () => {
    const { root, client, restoreFetch } = await renderDashboard();
    try {
      assert.doesNotMatch(document.body.innerHTML, /data-testid="active-filters"/);

      const todayButton = document.querySelector('[data-testid="filter-window-24h"]');
      assert.ok(todayButton, "expected the Today time-range button");
      await act(async () => click(todayButton!));
      assert.match(document.body.innerHTML, /data-testid="active-filter-chip"/);
      assert.match(document.body.innerHTML, /Today/);

      const categoryChip = document.querySelector('[data-testid="category-chip-armed_conflict_security"]');
      assert.ok(categoryChip);
      await act(async () => click(categoryChip!));
      let chips = document.querySelectorAll('[data-testid="active-filter-chip"]');
      assert.equal(chips.length, 2);

      const windowChipRemove = document.querySelector('[aria-label="Remove filter: Today"]');
      assert.ok(windowChipRemove, "expected a removable chip labelled Today");
      await act(async () => click(windowChipRemove!));
      chips = document.querySelectorAll('[data-testid="active-filter-chip"]');
      assert.equal(chips.length, 1);
      assert.doesNotMatch(document.body.innerHTML, /aria-label="Remove filter: Today"/);
      // Category chip (set separately) is still selected — removing one field
      // did not touch the other.
      assert.equal(
        document.querySelector('[data-testid="category-chip-armed_conflict_security"]')?.getAttribute("aria-pressed"),
        "true",
      );

      const clearAll = document.querySelector('[data-testid="active-filters-clear-all"]');
      assert.ok(clearAll);
      await act(async () => click(clearAll!));
      assert.doesNotMatch(document.body.innerHTML, /data-testid="active-filters"/);
      assert.equal(
        document.querySelector('[data-testid="category-chip-all"]')?.getAttribute("aria-pressed"),
        "true",
      );
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("Table view row selection: selecting two rows shows '2 selected' and Export selected downloads exactly those two", async () => {
    const signals = [makeSignal(0, { id: "a" }), makeSignal(1, { id: "b" }), makeSignal(2, { id: "c" })];
    const { root, client, restoreFetch } = await renderDashboard(signals);
    const originalCreateObjectURL = (globalThis as any).URL?.createObjectURL;
    const originalRevokeObjectURL = (globalThis as any).URL?.revokeObjectURL;
    let capturedCsv = "";
    const OriginalBlob = globalThis.Blob;
    (globalThis as any).Blob = class {
      parts: any[];
      constructor(parts: any[]) {
        this.parts = parts;
        capturedCsv = parts.join("");
      }
    };
    (globalThis as any).URL.createObjectURL = () => "blob:fake";
    (globalThis as any).URL.revokeObjectURL = () => {};
    try {
      const tableButton = document.querySelector('[data-testid="feed-view-table"]');
      assert.ok(tableButton);
      await act(async () => click(tableButton!));

      const rowCheckboxes = [...document.querySelectorAll('[data-testid="table-select-row"]')] as any[];
      assert.equal(rowCheckboxes.length, 3);
      rowCheckboxes[0].checked = true;
      await act(async () => click(rowCheckboxes[0]));
      rowCheckboxes[1].checked = true;
      await act(async () => click(rowCheckboxes[1]));

      assert.match(document.body.innerHTML, /2 selected/);
      const exportBtn = document.querySelector('[data-testid="export-selected-button"]');
      assert.ok(exportBtn, "expected the Export selected button");
      await act(async () => click(exportBtn!));

      assert.match(capturedCsv, /Signal 0/);
      assert.match(capturedCsv, /Signal 1/);
      assert.doesNotMatch(capturedCsv, /Signal 2/);
    } finally {
      (globalThis as any).Blob = OriginalBlob;
      (globalThis as any).URL.createObjectURL = originalCreateObjectURL;
      (globalThis as any).URL.revokeObjectURL = originalRevokeObjectURL;
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("Table view row selection clears when a filter changes", async () => {
    const signals = [makeSignal(0, { id: "a" }), makeSignal(1, { id: "b" })];
    const { root, client, restoreFetch } = await renderDashboard(signals);
    try {
      const tableButton = document.querySelector('[data-testid="feed-view-table"]');
      assert.ok(tableButton);
      await act(async () => click(tableButton!));

      const rowCheckboxes = [...document.querySelectorAll('[data-testid="table-select-row"]')] as any[];
      rowCheckboxes[0].checked = true;
      await act(async () => click(rowCheckboxes[0]));
      assert.match(document.body.innerHTML, /1 selected/);

      const todayButton = document.querySelector('[data-testid="filter-window-24h"]');
      assert.ok(todayButton);
      await act(async () => click(todayButton!));
      assert.doesNotMatch(document.body.innerHTML, /\d selected/);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("stream row single-line layout starts at lg, not md (TASK UI-FIX1 Part 1)", async () => {
    const signals = [makeSignal(0, { id: "a" }), makeSignal(1, { id: "b" })];
    const { root, client, restoreFetch } = await renderDashboard(signals);
    try {
      const rows = document.querySelectorAll('[data-testid="signal-stream-row"]');
      assert.equal(rows.length, 2);
      for (const row of rows) {
        const rowClass = row.getAttribute("class") ?? "";
        assert.match(rowClass, /\blg:flex-row\b/);
        assert.doesNotMatch(rowClass, /\bmd:flex-row\b/);
        const titleDiv = row.querySelector(".line-clamp-2");
        assert.ok(titleDiv, "expected the headline title div");
        const titleClass = titleDiv!.getAttribute("class") ?? "";
        assert.match(titleClass, /\blg:truncate\b/);
        assert.doesNotMatch(titleClass, /\bmd:truncate\b/);
      }
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });

  await runTest("render count stays bounded across mount + a handful of interactions (no render loop)", async () => {
    let renderCount = 0;
    function CountingDashboard() {
      renderCount++;
      return createElement(DashboardPage);
    }
    const { root, client, restoreFetch } = await (async () => {
      try {
        (globalThis as any).window.localStorage.removeItem("bbr_feed_view_mode");
        (globalThis as any).window.localStorage.removeItem("bbr.feed.sort");
      } catch {
        // ignore
      }
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/signals")) {
          const signals = Array.from({ length: 3 }, (_, i) => makeSignal(i));
          return new Response(JSON.stringify({ signals, total: signals.length }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as typeof fetch;
      const client = new QueryClient();
      const { root } = await renderElement(
        document,
        createElement(QueryClientProvider, { client }, createElement(CountingDashboard)),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      return { root, client, restoreFetch: () => (globalThis.fetch = original) };
    })();
    try {
      const sortSelect = document.querySelector('select[aria-label="Sort loaded signals"]');
      assert.ok(sortSelect);
      await act(async () => changeSelect(sortSelect!, "newest"));
      const todayButton = document.querySelector('[data-testid="filter-window-24h"]');
      assert.ok(todayButton);
      await act(async () => click(todayButton!));
      const tableButton = document.querySelector('[data-testid="feed-view-table"]');
      assert.ok(tableButton);
      await act(async () => click(tableButton!));

      assert.ok(
        renderCount < 30,
        `expected a bounded render count for mount + 3 interactions, got ${renderCount}`,
      );
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });
}

main();
