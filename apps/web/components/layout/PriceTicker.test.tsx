// Render coverage for TASK W2-DB Part 3 (2026-11-09) — PriceTicker's
// /api/prices poll must stop while signed out and must not schedule its 60s
// refetch timer while the tab is hidden. (Separate diagnosis, noted in the
// task report: PriceTicker is not currently mounted anywhere in the app —
// this still verifies its own polling logic is correct if/when it is.)
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
  const { AppRouterContext } = await import(
    "next/dist/shared/lib/app-router-context.shared-runtime.js"
  );
  const { AuthContext } = await import("@/components/auth/AuthProvider");
  const { PriceTicker } = await import("./PriceTicker");

  const fakeRouter = {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  };

  async function render(user: { id: string } | null) {
    const client = new QueryClient();
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(
          AppRouterContext.Provider,
          { value: fakeRouter },
          createElement(
            QueryClientProvider,
            { client },
            createElement(
              AuthContext.Provider,
              { value: { user: user as never, session: null, profile: null, isLoading: false } },
              createElement(PriceTicker),
            ),
          ),
        ),
      );
    });
    return { root, client };
  }

  await runTest("signed out: never fetches /api/prices", async () => {
    let fetches = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetches += 1;
      return new Response(JSON.stringify({ prices: [] }), { status: 200 });
    }) as typeof fetch;
    try {
      const { root, client } = await render(null);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      assert.equal(fetches, 0, "a signed-out ticker must not poll /api/prices");
      await act(async () => root.unmount());
      client.clear();
    } finally {
      globalThis.fetch = original;
    }
  });

  await runTest("signed in: fetches /api/prices", async () => {
    let fetches = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetches += 1;
      return new Response(JSON.stringify({ prices: [{ symbol: "USOIL", price: 70 }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const { root, client } = await render({ id: "user-1" });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      assert.ok(fetches > 0, "a signed-in ticker should fetch /api/prices");
      assert.match(document.body.innerHTML, /USOIL/);
      await act(async () => root.unmount());
      client.clear();
    } finally {
      globalThis.fetch = original;
    }
  });

  await runTest("signed in + hidden tab: no 60s refetch timer is scheduled", async () => {
    const trackedDelays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    (globalThis as any).setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      if (ms === 60_000) trackedDelays.push(ms);
      return realSetTimeout(fn as never, ms, ...(args as []));
    }) as unknown as typeof setTimeout;
    const realDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ prices: [] }), { status: 200 })) as typeof fetch;
    try {
      const { root, client } = await render({ id: "user-1" });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      assert.equal(trackedDelays.length, 0, "no 60s poll timer should be scheduled while the tab is hidden");
      await act(async () => root.unmount());
      client.clear();
    } finally {
      globalThis.fetch = original;
      globalThis.setTimeout = realSetTimeout;
      if (realDescriptor) Object.defineProperty(document, "visibilityState", realDescriptor);
    }
  });
}

void main();
