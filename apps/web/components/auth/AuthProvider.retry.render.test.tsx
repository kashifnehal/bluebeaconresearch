// TASK W2-AUTH Part 3: AuthProvider's profileLoadedForUserId ref used to be
// set *before* the profile fetch, so a failed fetch left it set and a later
// auth event would see "already loaded for this user" and never retry. Fix:
// clear the ref on failure and retry with a short fixed backoff, up to 3
// attempts total, then stop.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
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
  const { client } = await setupSignedInSupabase(document);

  let fetchCount = 0;
  const originalFrom = client.from;
  client.from = ((table: string) => {
    if (table !== "profiles") return originalFrom(table);
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => {
        fetchCount += 1;
        if (fetchCount === 1) throw new Error("network blip");
        return {
          data: {
            id: "user-1",
            onboarding_completed: true,
            product_tour_completed: true,
            plan_tier: "pro",
            full_name: "Ada Lovelace",
          },
          error: null,
        };
      },
    };
    return builder;
  }) as typeof client.from;

  const { AuthProvider, useAuth } = await import("./AuthProvider");

  let latestProfile: unknown = null;
  function Probe() {
    const { profile } = useAuth();
    latestProfile = profile;
    return null;
  }

  await runTest("a profile fetch that fails once then succeeds retries exactly once and the profile arrives", async () => {
    document.body.replaceChildren();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(createElement(AuthProvider, null, createElement(Probe)));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
      });

      assert.equal(fetchCount, 2, `expected exactly 2 profile fetch attempts, got ${fetchCount}`);
      assert.ok(latestProfile, "expected the profile to eventually arrive after one retry");
    } finally {
      await act(async () => root.unmount());
    }
  });
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
