// Render coverage for TASK CAL-REFRESH-DRIVER-CSV Part 2 (2026-11-24) — the
// "Export chart data (CSV)" button must appear only once real rows have
// loaded, and stay hidden in the loading/error/unavailable/empty states.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { window: domWindow, document } = parseHTML("<!doctype html><html><body></body></html>");
const g = globalThis as any;
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "DocumentFragment", "MutationObserver"] as const) {
  Object.defineProperty(g, key, {
    value: key === "window" ? domWindow : key === "document" ? document : (domWindow as any)[key],
    configurable: true,
  });
}
g.IS_REACT_ACT_ENVIRONMENT = true;
if (typeof g.self === "undefined") g.self = g;
if (typeof (domWindow as any).self === "undefined") (domWindow as any).self = domWindow;

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

async function main() {
  const { DriverBreakdownChart } = await import("./DriverBreakdownChart");

  // React's act() only flushes pending effects/state updates when its own
  // callback's promise settles — a real-time retry timer (react-query's
  // backoff) that fires *during* one long act() wait never gets flushed into
  // the committed DOM. So the real wait is split into several short act()
  // calls: each exit flushes whatever settled since the previous one,
  // including react-query's retry backoff and Recharts' own measurement
  // pass (which needs its own flush under linkedom's zero-size layout).
  async function render(fetchImpl: typeof fetch, flushes = 1) {
    const client = new QueryClient();
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(DriverBreakdownChart, {
            symbol: "USOIL",
            label: "Crude Oil",
            fromIso: "2026-11-01T00:00:00.000Z",
            toIso: "2026-11-09T00:00:00.000Z",
            rangeId: "1M",
          }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    for (let i = 0; i < flushes; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1300));
      });
    }
    return { root, client, restoreFetch: () => { globalThis.fetch = original; } };
  }

  await runTest("export button appears once rows have loaded", async () => {
    const { root, client, restoreFetch } = await render(
      (async () =>
        new Response(
          JSON.stringify({
            rows: [{ date: "2026-11-02", category: "armed_conflict_security", count: 3 }],
          }),
          { status: 200 },
        )) as typeof fetch,
    );
    try {
      assert.match(document.body.innerHTML, /data-testid="driver-breakdown-export"/);
      assert.match(
        document.body.innerHTML,
        /title="All loaded rows for this range, including hidden series"/,
      );
    } finally {
      await act(async () => root.unmount());
      client.clear();
      restoreFetch();
    }
  });

  await runTest("export button is absent in the empty state (zero loaded rows)", async () => {
    const { root, client, restoreFetch } = await render(
      (async () => new Response(JSON.stringify({ rows: [] }), { status: 200 })) as typeof fetch,
      1,
    );
    try {
      assert.match(document.body.innerHTML, /data-testid="driver-breakdown-empty"/);
      assert.doesNotMatch(document.body.innerHTML, /data-testid="driver-breakdown-export"/);
    } finally {
      await act(async () => root.unmount());
      client.clear();
      restoreFetch();
    }
  });

  await runTest("export button is absent in the error state", async () => {
    const { root, client, restoreFetch } = await render(
      (async () => new Response(JSON.stringify({ error: "unavailable" }), { status: 500 })) as typeof fetch,
      4, // the component retries twice (default react-query backoff ~1s + ~2s) before settling as isError
    );
    try {
      assert.match(document.body.innerHTML, /data-testid="driver-breakdown-unavailable"/);
      assert.doesNotMatch(document.body.innerHTML, /data-testid="driver-breakdown-export"/);
    } finally {
      await act(async () => root.unmount());
      client.clear();
      restoreFetch();
    }
  });
}

void main();
