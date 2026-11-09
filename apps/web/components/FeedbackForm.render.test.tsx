// TASK W2-AUTH Part 2: FeedbackForm's email prefill must read the signed-in
// user from AuthProvider's context, never calling supabase.auth.getUser()
// itself.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

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
  const { client } = await setupSignedInSupabase(document, { email: "ada@example.com" });
  let getUserCalls = 0;
  const originalGetUser = client.auth.getUser;
  client.auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
    getUserCalls += 1;
    return originalGetUser(...args);
  }) as typeof client.auth.getUser;

  const { FeedbackForm } = await import("./FeedbackForm");

  await runTest(
    "FeedbackForm pre-fills the signed-in email from context, calling getUser() 0 times",
    async () => {
      document.body.replaceChildren();
      const host = document.createElement("div");
      document.body.appendChild(host);
      const root = createRoot(host);
      try {
        await act(async () => {
          root.render(createElement(AuthProvider, null, createElement(FeedbackForm)));
        });
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
        });

        assert.equal(getUserCalls, 0, "FeedbackForm must not call supabase.auth.getUser()");
        const emailInput = document.querySelector("#feedback-email") as HTMLInputElement | null;
        assert.ok(emailInput, "expected the feedback email input to render");
        assert.equal(emailInput!.value, "ada@example.com");
      } finally {
        await act(async () => root.unmount());
      }
    },
  );
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
