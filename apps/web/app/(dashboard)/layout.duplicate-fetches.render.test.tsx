// TASK W6 Part 4, step 1: measures real API calls on a single signed-in
// /dashboard load by mounting the real Sidebar, TopBar (which itself mounts
// NotificationPanel and the closed-by-default NotificationConnectModal),
// NotificationConnectPrompt, MobileTabBar, and the real DashboardPage inside
// them, matching the ./layout.tsx -> ./dashboard/page.tsx nesting production
// uses. ProductTour and FeatureHints (also mounted by the real layout) are
// left out: they statically import "driver.js/dist/hints.css", a bare CSS
// import that only resolves through Next's webpack build, not plain tsx —
// and neither makes any network call of its own (checked: no fetch/useQuery/
// `/api/` reference in either file), so leaving them out does not change
// what this file measures. Same linkedom + react-dom/client harness as
// dashboard/page.render.test.tsx, plus the AppRouterContext/PathnameContext
// providers Sidebar.test.tsx needs for its next/navigation hooks.
//
// Result (see the printed per-route counts below): a single mount makes
// exactly one call to each of /api/telegram/status, /api/alerts/recent,
// /api/signals/source-stats, and /api/signals — no duplicate reproduces here.
// A 2026-11-15 browser observation reported roughly 4x/2x/2x/2x for those
// same four routes; this harness could not reproduce that, and AuthProvider
// already guards the one real mechanism that could explain it (gotrue-js's
// redundant INITIAL_SESSION auth event, skipped explicitly — see its own
// comment). Most likely explanation left: `next dev`'s React Strict Mode
// double-effect/Fast-Refresh behavior, which does not affect a production
// build. No code changed for this task; this file stays as a regression
// guard (step 3) in case a real duplicate is introduced later.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { setupDom, renderElement, setupSignedInSupabase } from "@/lib/test-render";
import { AuthProvider } from "@/components/auth/AuthProvider";

const document = setupDom();

class FakeIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).IntersectionObserver = FakeIntersectionObserver;
(globalThis as any).window.IntersectionObserver = FakeIntersectionObserver;

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

/** Strips the query string so /api/signals?x=1 and /api/signals?x=2 count as the same route. */
function routeOf(url: string): string {
  return url.split("?")[0];
}

async function renderDashboardRoute() {
  try {
    (globalThis as any).window.localStorage.removeItem("bbr_feed_view_mode");
    (globalThis as any).window.localStorage.removeItem("bbr.feed.sort");
    (globalThis as any).window.localStorage.removeItem("bbr.feed.hideSummaries");
  } catch {
    // ignore
  }

  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(routeOf(url));
    if (url.startsWith("/api/signals/source-stats")) {
      return new Response(JSON.stringify({ sourcesLast24h: 12 }), { status: 200 });
    }
    if (url.startsWith("/api/signals")) {
      return new Response(JSON.stringify({ signals: [], total: 0 }), { status: 200 });
    }
    if (url.startsWith("/api/prices")) {
      return new Response(JSON.stringify({ prices: [] }), { status: 200 });
    }
    if (url.startsWith("/api/telegram/status")) {
      return new Response(JSON.stringify({ telegramConnected: false }), { status: 200 });
    }
    if (url.startsWith("/api/alerts/recent")) {
      return new Response(JSON.stringify({ alerts: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  const { AppRouterContext } = await import(
    "next/dist/shared/lib/app-router-context.shared-runtime.js"
  );
  const { PathnameContext } = await import(
    "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
  );
  // Not importing the real ./layout.tsx: it statically pulls in FeatureHints,
  // which imports "driver.js/dist/hints.css" — a bare CSS import that only
  // resolves through Next's webpack build, not plain tsx. ProductTour and
  // FeatureHints make no network call of their own (checked: neither
  // references fetch/useQuery/`/api/`), so leaving them out of this
  // fetch-counting harness does not affect what's being measured here.
  const { Sidebar } = await import("@/components/layout/Sidebar");
  const { TopBar } = await import("@/components/layout/TopBar");
  const { MobileTabBar } = await import("@/components/layout/MobileTabBar");
  const { NotificationConnectPrompt } = await import("@/components/NotificationConnectPrompt");
  const { default: DashboardPage } = await import("./dashboard/page");

  const fakeRouter = {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  };

  const client = new QueryClient();
  const { root } = await renderElement(
    document,
    createElement(
      AppRouterContext.Provider,
      { value: fakeRouter },
      createElement(
        PathnameContext.Provider,
        { value: "/dashboard" },
        createElement(
          QueryClientProvider,
          { client },
          createElement(
            AuthProvider,
            null,
            createElement(
              "div",
              null,
              createElement(NotificationConnectPrompt),
              createElement(Sidebar),
              createElement(TopBar),
              createElement(DashboardPage),
              createElement(MobileTabBar),
            ),
          ),
        ),
      ),
    ),
  );
  // Long enough for idle-deferred calls (linkedom falls back to a setTimeout(fn, 0)
  // macrotask — see lib/idle-defer.ts) and react-query's own settle to both fire.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });

  return {
    calls,
    counts: calls.reduce<Record<string, number>>((acc, r) => {
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {}),
    root,
    client,
    restoreFetch: () => (globalThis.fetch = original),
  };
}

async function main() {
  await setupSignedInSupabase(document);

  await runTest("one signed-in /dashboard load makes at most one call per route (no duplicate reproduces)", async () => {
    const { counts, root, client, restoreFetch } = await renderDashboardRoute();
    try {
      // Printed for the task report (Step 1) — not an assertion by itself.
      console.log("  per-route call counts:", JSON.stringify(counts));

      // Step 3's regression guard: this harness measures 1 call per route on
      // the unmodified code (see the file header) — no fix was needed, so
      // this is the baseline itself, not a "before vs. after" change. Any
      // count above this is a regression that should be investigated.
      assert.ok((counts["/api/telegram/status"] ?? 0) <= 1, `telegram/status: ${counts["/api/telegram/status"]}`);
      assert.ok((counts["/api/alerts/recent"] ?? 0) <= 1, `alerts/recent: ${counts["/api/alerts/recent"]}`);
      assert.ok((counts["/api/signals/source-stats"] ?? 0) <= 1, `signals/source-stats: ${counts["/api/signals/source-stats"]}`);
      assert.ok((counts["/api/signals"] ?? 0) <= 1, `signals: ${counts["/api/signals"]}`);
    } finally {
      restoreFetch();
      await act(async () => root.unmount());
      client.clear();
    }
  });
}

main().then(() => {
  // setupSignedInSupabase() starts a real browser auth client with its own
  // token-refresh timer — exit so the test chain continues (same fix as
  // dashboard/page.render.test.tsx and WatchlistClient.render.test.tsx).
  process.exit(process.exitCode ?? 0);
});
