// TASK W2-AUTH Part 1: useMe() must read AuthProvider's already-resolved
// context (one getSession() call per page load, mounted once at the root in
// app/providers.tsx) instead of calling supabase.auth.getUser() itself.
import assert from "node:assert/strict";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { setupDom, setupSignedInSupabase } from "@/lib/test-render";

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
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const g = globalThis as typeof globalThis & { window: Window & { matchMedia?: (q: string) => MediaQueryList } };
  if (typeof g.window.matchMedia !== "function") {
    g.window.matchMedia = () =>
      ({
        matches: false,
        media: "",
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      }) as unknown as MediaQueryList;
  }

  const { client } = await setupSignedInSupabase(document);
  let getUserCalls = 0;
  const originalGetUser = client.auth.getUser;
  client.auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
    getUserCalls += 1;
    return originalGetUser(...args);
  }) as typeof client.auth.getUser;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;

  const { Providers } = await import("@/app/providers");

  await runTest("Providers' useMe() resolves the signed-in user via context, calling getUser() 0 times", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(createElement(Providers, null, createElement("p", null, "child")));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      assert.equal(getUserCalls, 0, "useMe()/Providers must not call supabase.auth.getUser()");

      const { useAuthStore } = await import("@/store/useAuthStore");
      assert.equal(useAuthStore.getState().userId, "user-1", "expected useMe() to sync the context user into useAuthStore");
    } finally {
      await act(async () => root.unmount());
    }
  });

  globalThis.fetch = originalFetch;
}

main().then(() => {
  // setupSignedInSupabase() creates a real browser auth client, which starts a
  // token-refresh timer — exit so the test chain continues.
  process.exit(process.exitCode ?? 0);
});
