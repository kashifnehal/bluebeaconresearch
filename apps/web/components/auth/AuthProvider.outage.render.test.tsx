// TASK W2-AUTH Part 4: a getSession() failure shaped like an Auth-backend
// outage (5xx, or a non-JSON/HTML response wrapped by @supabase/auth-js as
// AuthUnknownError — the 2026-11-09 Cloudflare 522 incident) must not put
// vendor/code text on screen, must not clear whatever's already in state, and
// retries once after a short delay.
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
  const { AuthUnknownError } = await import("@supabase/supabase-js");

  let getSessionCalls = 0;
  const originalGetSession = client.auth.getSession;
  client.auth.getSession = (async () => {
    getSessionCalls += 1;
    if (getSessionCalls === 1) {
      // The real shape: GoTrue's fetch handling throws AuthUnknownError when
      // a non-2xx response body isn't valid JSON (an HTML Cloudflare 522
      // page instead of a GoTrue JSON error body).
      throw new AuthUnknownError("Unexpected error", new SyntaxError("Unexpected token < in JSON"));
    }
    return originalGetSession();
  }) as typeof originalGetSession;

  const { AuthProvider, useAuth } = await import("./AuthProvider");

  let latestState: { user: unknown; isLoading: boolean } = { user: null, isLoading: true };
  function Probe() {
    const { user, isLoading } = useAuth();
    latestState = { user, isLoading };
    return createElement("div", { "data-testid": "probe" }, isLoading ? "loading" : "ready");
  }

  await runTest(
    "a 522/HTML getSession() failure retries once, resolves the session, and never puts vendor/code text on screen",
    async () => {
      document.body.replaceChildren();
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      try {
        await act(async () => {
          root.render(createElement(AuthProvider, null, createElement(Probe)));
        });
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 800));
        });

        assert.equal(getSessionCalls, 2, `expected exactly one retry (2 getSession() calls), got ${getSessionCalls}`);
        assert.equal(latestState.isLoading, false, "expected loading to resolve after the retry succeeds");
        assert.ok(latestState.user, "expected the session to resolve on retry, not stay cleared");

        const screenText = document.body.innerHTML;
        for (const vendorText of ["AuthUnknownError", "522", "Cloudflare", "SyntaxError", "Unexpected token"]) {
          assert.doesNotMatch(screenText, new RegExp(vendorText), `"${vendorText}" must never reach the screen`);
        }
      } finally {
        await act(async () => root.unmount());
      }
    },
  );
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
