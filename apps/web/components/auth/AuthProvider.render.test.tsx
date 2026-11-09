// Rendered coverage for the dashboard layout's AuthProvider wiring (TASK
// W-AUTH Part 2): mounts the real AuthProvider around the real TopBar,
// NotificationConnectPrompt, FirstTouchLogger and ProductTour — the
// components whose own getUser() calls were replaced by the shared context
// — with a mocked supabase browser client, and asserts the auth check
// collapsed from "5 or 6 getUser() calls per page load" down to one shared
// getSession(). Does not import the literal app/(dashboard)/layout.tsx file:
// that file also renders components/onboarding/FeatureHints.tsx, which
// imports "driver.js/dist/hints.css" directly — a raw CSS import tsx's
// require hook can't parse outside Next's bundler (no existing test renders
// FeatureHints either, for the same reason). FeatureHints makes no
// supabase.auth call, so it's outside this task's six-file scope anyway.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { setupDom } from "@/lib/test-render";

const document = setupDom();

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

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  // @supabase/ssr's browser client reads document.cookie for its own session
  // bootstrap on construction — linkedom doesn't implement it (same fix as
  // components/FirstTouchCapture.test.tsx).
  if (typeof document.cookie !== "string") {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: () => {},
    });
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/alerts/recent")) {
      return new Response(JSON.stringify({ alerts: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  const browser = await import("@/lib/supabase");
  const browserClient = browser.getSupabaseBrowserClient();
  assert.ok(browserClient, "browser client was not created");

  let getUserCalls = 0;
  let getSessionCalls = 0;

  const fakeUser = {
    id: "user-1",
    email: "ada@example.com",
    user_metadata: { full_name: "Ada Lovelace" },
  } as any;
  const fakeSession = {
    user: fakeUser,
    access_token: "tok",
    refresh_token: "rtok",
  } as any;

  browserClient.auth.getUser = (async () => {
    getUserCalls += 1;
    return { data: { user: fakeUser }, error: null };
  }) as typeof browserClient.auth.getUser;

  browserClient.auth.getSession = (async () => {
    getSessionCalls += 1;
    return { data: { session: fakeSession }, error: null };
  }) as typeof browserClient.auth.getSession;

  browserClient.auth.onAuthStateChange = ((
    _callback: (event: string, session: unknown) => void,
  ) => ({
    data: { subscription: { unsubscribe() {} } },
  })) as typeof browserClient.auth.onAuthStateChange;

  function makeQueryBuilder(result: { data: unknown; error: unknown }) {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => result,
    };
    return builder;
  }
  browserClient.from = ((_table: string) =>
    makeQueryBuilder({
      data: {
        id: fakeUser.id,
        onboarding_completed: true,
        product_tour_completed: true,
        plan_tier: "pro",
        full_name: "Ada Lovelace",
      },
      error: null,
    })) as typeof browserClient.from;

  const { AppRouterContext } = await import(
    "next/dist/shared/lib/app-router-context.shared-runtime.js"
  );
  const { PathnameContext } = await import(
    "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
  );
  const { AuthProvider } = await import("./AuthProvider");
  const { TopBar } = await import("@/components/layout/TopBar");
  const { NotificationConnectPrompt } = await import("@/components/NotificationConnectPrompt");
  const { FirstTouchLogger } = await import("@/components/FirstTouchLogger");
  const { ProductTour } = await import("@/components/onboarding/ProductTour");

  const fakeRouter = {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  };

  let childRenders = 0;
  function CountingChild() {
    childRenders += 1;
    return createElement("div", { "data-testid": "child" }, "dashboard content");
  }

  // Same tree app/(dashboard)/layout.tsx mounts (minus Sidebar/FeatureHints/
  // MobileTabBar/LegalDisclaimerFooter, which call no supabase.auth method
  // and aren't part of this task's six-file scope — see file header).
  function DashboardTree() {
    return createElement(
      AuthProvider,
      null,
      createElement(FirstTouchLogger),
      createElement(ProductTour),
      createElement(NotificationConnectPrompt),
      createElement(TopBar),
      createElement(CountingChild),
    );
  }

  await runTest(
    "The dashboard auth tree resolves via one getSession() call, never getUser() on the client, and stays under 6 renders",
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
              QueryClientProvider,
              { client: queryClient },
              createElement(
                AppRouterContext.Provider,
                { value: fakeRouter },
                createElement(
                  PathnameContext.Provider,
                  { value: "/dashboard" },
                  createElement(DashboardTree),
                ),
              ),
            ),
          );
        });
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
        });

        assert.equal(getUserCalls, 0, "no client-side component may call supabase.auth.getUser()");
        assert.equal(getSessionCalls, 1, "AuthProvider must call getSession() exactly once per page load");
        assert.ok(childRenders < 6, `dashboard content rendered ${childRenders} times (expected < 6)`);

        const text = document.body.textContent ?? "";
        assert.match(text, /dashboard content/);
        // TopBar reads the signed-in user's name from the shared auth context,
        // not its own getUser() call.
        assert.match(text, /Ada Lovelace/);
      } finally {
        await act(async () => root.unmount());
      }
    },
  );

  globalThis.fetch = originalFetch;
}

main().then(() => {
  // Supabase's auth client starts a refresh timer; exit so the test chain continues.
  process.exit(process.exitCode ?? 0);
});
