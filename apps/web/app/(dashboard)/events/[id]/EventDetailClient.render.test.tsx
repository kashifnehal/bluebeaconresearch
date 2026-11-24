// TASK W2-AUTH Part 2: EventDetailClient's "create alert rule" action must
// read the signed-in user from AuthProvider's context, never calling
// supabase.auth.getUser() itself.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { setupDom, setupSignedInSupabase } from "@/lib/test-render";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EventDetailResponse } from "@/app/api/signals/[id]/route";
import type { Signal } from "@blue-beacon-research/shared";

const document = setupDom();

// SignalChatPanel scrolls its message list on mount — linkedom's elements
// don't implement scrollTo at all.
if (typeof (globalThis as any).HTMLElement.prototype.scrollTo !== "function") {
  (globalThis as any).HTMLElement.prototype.scrollTo = function scrollTo() {};
}

if (typeof (globalThis as any).window.location === "undefined") {
  Object.defineProperty((globalThis as any).window, "location", {
    configurable: true,
    value: {
      href: "http://localhost/events/signal-1",
      origin: "http://localhost",
      pathname: "/events/signal-1",
      search: "",
      hash: "",
      host: "localhost",
      hostname: "localhost",
      protocol: "http:",
    },
  });
}

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

function fakeSignal(): Signal {
  return {
    id: "signal-1",
    title: "Red Sea shipping disrupted",
    summary: "Test summary",
    severity: 7,
    confidence: 0.8,
    eventType: "conflict",
    country: "Yemen",
    region: "middle-east",
    sourcesCount: 1,
    commodityImpacts: [],
    currencyPairImpacts: [],
    isBreaking: false,
    isActive: true,
    classificationMethod: null,
    mediaImpactEntity: null,
    mediaImpactCaveat: null,
    eventCategory: null,
    marketMechanism: null,
    isPreview: false,
    novelty: null,
    sourceConfirmation: null,
    materialityReasoning: null,
    invalidationCondition: null,
    createdAt: new Date().toISOString(),
    eventDate: new Date().toISOString(),
  } as unknown as Signal;
}

async function main() {
  const { client } = await setupSignedInSupabase(document);
  let getUserCalls = 0;
  const originalGetUser = client.auth.getUser;
  client.auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
    getUserCalls += 1;
    return originalGetUser(...args);
  }) as typeof client.auth.getUser;

  let insertedRow: Record<string, unknown> | null = null;
  const originalFrom = client.from;
  client.from = ((table: string) => {
    if (table === "alert_rules") {
      return {
        insert: async (row: Record<string, unknown>) => {
          insertedRow = row;
          return { error: null };
        },
      } as any;
    }
    return originalFrom(table);
  }) as typeof client.from;

  const data: EventDetailResponse = {
    signal: fakeSignal(),
    sources: [],
    historicalComparisons: [],
    relatedEvents: [],
    relatedEventsTotal: 0,
    pricesAtSignal: [],
    marketImpactMagnitudes: {},
    ownOutcomes: {},
    degraded: [],
  } as unknown as EventDetailResponse;

  const { AppRouterContext } = await import(
    "next/dist/shared/lib/app-router-context.shared-runtime.js"
  );
  const fakeRouter = {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  };

  const { EventDetailClient } = await import("./EventDetailClient");

  await runTest(
    "EventDetailClient's createAlertRule uses the context user, calling getUser() 0 times",
    async () => {
      const queryClient = new QueryClient();
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
              createElement(
                QueryClientProvider,
                { client: queryClient },
                createElement(
                  AuthProvider,
                  null,
                  createElement(TooltipProvider, null, createElement(EventDetailClient, { data })),
                ),
              ),
            ),
          );
        });
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
        });

        const setAlertButton = [...document.querySelectorAll("button")].find((b) =>
          (b.textContent ?? "").toLowerCase().includes("alert"),
        );
        assert.ok(setAlertButton, "expected the 'Create Alert' / 'Create Severe Alert' CTA button");
        await act(async () => {
          setAlertButton!.dispatchEvent(
            new (globalThis as any).window.Event("click", { bubbles: true }),
          );
        });

        const createButton = [...document.querySelectorAll("button")].find(
          (b) => (b.textContent ?? "").trim() === "Save Rule",
        );
        assert.ok(createButton, "expected the modal's 'Save Rule' button");
        await act(async () => {
          createButton!.dispatchEvent(new (globalThis as any).window.Event("click", { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 20));
        });

        assert.equal(getUserCalls, 0, "EventDetailClient must not call supabase.auth.getUser()");
        assert.ok(insertedRow, "expected an alert_rules row to be inserted");
        assert.equal(insertedRow!.user_id, "user-1");
      } finally {
        await act(async () => root.unmount());
        queryClient.clear();
      }
    },
  );

  async function renderSourcesTab(sources: EventDetailResponse["sources"]) {
    const sourcesData: EventDetailResponse = {
      signal: fakeSignal(),
      sources,
      historicalComparisons: [],
      relatedEvents: [],
      relatedEventsTotal: 0,
      pricesAtSignal: [],
      marketImpactMagnitudes: {},
      ownOutcomes: {},
      degraded: [],
    } as unknown as EventDetailResponse;

    const queryClient = new QueryClient();
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
            { client: queryClient },
            createElement(
              AuthProvider,
              null,
              createElement(TooltipProvider, null, createElement(EventDetailClient, { data: sourcesData })),
            ),
          ),
        ),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    const sourcesTabButton = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim().toLowerCase() === "timeline",
    );
    assert.ok(sourcesTabButton, "expected the 'timeline' tab trigger (value=\"sources\")");
    await act(async () => {
      sourcesTabButton!.dispatchEvent(new (globalThis as any).window.Event("click", { bubbles: true }));
    });

    return { root, queryClient };
  }

  await runTest("a source with a url renders a clickable row that links out", async () => {
    const { root, queryClient } = await renderSourcesTab([
      {
        title: "Tankers delayed near strait",
        url: "https://example.com/strait-delay",
        sourceLabel: "Example Wire",
        domain: "example.com",
        publishedAt: "2026-11-01T08:00:00.000Z",
      },
    ] as unknown as EventDetailResponse["sources"]);
    try {
      const link = document.querySelector('a[href="https://example.com/strait-delay"]') as HTMLAnchorElement;
      assert.ok(link, "expected an anchor linking to the source url");
      assert.equal(link.getAttribute("target"), "_blank");
      assert.equal(link.getAttribute("rel"), "noopener noreferrer");
      assert.match(link.textContent ?? "", /example\.com/);
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
    }
  });

  await runTest("a source with no url renders the outlet name as plain text, never href=\"#\"", async () => {
    const { root, queryClient } = await renderSourcesTab([
      {
        title: "Wire report, no link",
        url: null,
        sourceLabel: "Reuters",
        domain: null,
        publishedAt: "2026-11-01T08:00:00.000Z",
      },
    ] as unknown as EventDetailResponse["sources"]);
    try {
      assert.equal(document.querySelector('a[href="#"]'), null, "must not render href=\"#\"");
      const anyAnchor = document.querySelector("a");
      assert.equal(anyAnchor, null, "a source with no url must not render inside an anchor at all");
      assert.match(document.body.textContent ?? "", /Reuters/);
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
    }
  });

  // ── TASK NQW3-FILTER1 Part 8 — required credit lines ────────────────────

  await runTest("an EIA source shows the required credit line with the date", async () => {
    const { root, queryClient } = await renderSourcesTab([
      {
        title: "Weekly petroleum status report",
        url: "https://www.eia.gov/petroleum/weekly/",
        sourceLabel: "EIA Today in Energy",
        domain: "eia.gov",
        publishedAt: "2026-11-20T12:00:00.000Z",
        collectorSource: "rss",
      },
    ] as unknown as EventDetailResponse["sources"]);
    try {
      assert.match(
        document.body.textContent ?? "",
        /Source: U\.S\. Energy Information Administration \(Nov 20, 2026\)\. Summary written by BBR\./,
      );
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
    }
  });

  await runTest("a non-official source shows no credit line", async () => {
    const { root, queryClient } = await renderSourcesTab([
      {
        title: "Regional outlet covers the story",
        url: "https://example.com/story",
        sourceLabel: "Example Wire",
        domain: "example.com",
        publishedAt: "2026-11-20T12:00:00.000Z",
        collectorSource: "rss",
      },
    ] as unknown as EventDetailResponse["sources"]);
    try {
      assert.equal((document.body.textContent ?? "").includes("Summary written by BBR"), false);
      assert.equal((document.body.textContent ?? "").includes("The GDELT Project"), false);
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
    }
  });

  await runTest("a GDELT-sourced item shows the GDELT citation with a link to the GDELT Project", async () => {
    const { root, queryClient } = await renderSourcesTab([
      {
        title: "Wire coverage picked up via GDELT",
        url: "https://news.example.com/wire-story",
        sourceLabel: null,
        domain: "news.example.com",
        publishedAt: "2026-11-20T12:00:00.000Z",
        collectorSource: "gdelt",
      },
    ] as unknown as EventDetailResponse["sources"]);
    try {
      assert.match(document.body.textContent ?? "", /Event data: The GDELT Project/);
      const gdeltLink = document.querySelector('a[href="https://www.gdeltproject.org"]');
      assert.ok(gdeltLink, "expected a link to https://www.gdeltproject.org");
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
    }
  });
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
