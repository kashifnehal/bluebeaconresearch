// TASK W2-AUTH Part 2: AlertsPage must read the signed-in user from
// AuthProvider's context, never calling supabase.auth.getUser() itself —
// fetchConnectedChannels() and the "create alert rule" mutation both used to.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { setupDom, setupSignedInSupabase } from "@/lib/test-render";
import { AuthProvider } from "@/components/auth/AuthProvider";

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
  const { client } = await setupSignedInSupabase(document);
  let getUserCalls = 0;
  const originalGetUser = client.auth.getUser;
  client.auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
    getUserCalls += 1;
    return originalGetUser(...args);
  }) as typeof client.auth.getUser;

  // fetchConnectedChannels() reads user_channels; not covered by
  // setupSignedInSupabase's "profiles"/"user_preferences" stubs.
  const originalFrom = client.from;
  client.from = ((table: string) => {
    if (table === "user_channels") {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return builder;
    }
    return originalFrom(table);
  }) as typeof client.from;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/alert-rules")) {
      return new Response(JSON.stringify({ rules: [] }), { status: 200 });
    }
    if (url.startsWith("/api/alerts/recent")) {
      return new Response(JSON.stringify({ alerts: [], total: 0, hasMore: false }), { status: 200 });
    }
    if (url.startsWith("/api/alerts/rule-stats")) {
      return new Response(JSON.stringify({ stats: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as typeof fetch;

  const { default: AlertsPage } = await import("./page");

  await runTest("AlertsPage resolves its signed-in user from context, calling getUser() 0 times", async () => {
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
            createElement(AuthProvider, null, createElement(AlertsPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      assert.equal(getUserCalls, 0, "AlertsPage must not call supabase.auth.getUser()");
      assert.match(document.body.innerHTML, /data-testid="page-shell"/);
    } finally {
      await act(async () => root.unmount());
      queryClient.clear();
      globalThis.fetch = originalFetch;
    }
  });
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
