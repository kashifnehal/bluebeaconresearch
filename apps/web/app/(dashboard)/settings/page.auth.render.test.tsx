// TASK W2-AUTH Part 2: SettingsPage's profile-load effect must read the
// signed-in user from AuthProvider's context, never calling
// supabase.auth.getUser() itself.
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

  // SettingsPage's profile load uses .single(), which setupSignedInSupabase's
  // query-builder stub doesn't implement.
  const originalFrom = client.from;
  client.from = ((table: string) => {
    if (table === "profiles") {
      const row = {
        id: "user-1",
        onboarding_completed: true,
        product_tour_completed: true,
        plan_tier: "pro",
        full_name: "Ada Lovelace",
      };
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        // AuthProvider's own fetchProfileForUser() uses maybeSingle();
        // SettingsPage's separate profile-row read uses single().
        maybeSingle: async () => ({ data: row, error: null }),
        single: async () => ({ data: row, error: null }),
      };
      return builder;
    }
    return originalFrom(table);
  }) as typeof client.from;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

  const { default: SettingsPage } = await import("./page");

  await runTest("SettingsPage resolves the signed-in profile from context, calling getUser() 0 times", async () => {
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
            createElement(AuthProvider, null, createElement(SettingsPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      assert.equal(getUserCalls, 0, "SettingsPage must not call supabase.auth.getUser()");
      assert.doesNotMatch(
        document.body.innerHTML,
        /data-testid="settings-profile-skeleton"/,
        "expected the profile to have loaded from context by now",
      );
      assert.match(document.body.innerHTML, /Terminal User|Ada Lovelace/);
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
