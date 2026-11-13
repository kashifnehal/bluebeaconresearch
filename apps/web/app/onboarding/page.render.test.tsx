// TASK W2-AUTH Part 2: OnboardingPage's prefill effect and finish() must read
// the signed-in user from AuthProvider's context, never calling
// supabase.auth.getUser() itself. AuthProvider is now mounted once at the
// root (app/providers.tsx), so /onboarding — outside the (dashboard) route
// group — has it as an ancestor too.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { setupDom, setupSignedInSupabase } from "@/lib/test-render";
import { AuthProvider } from "@/components/auth/AuthProvider";

const document = setupDom();

// next/image's getImgProps() reads window.location.href, which linkedom
// doesn't implement — this page is the only one under test that renders a
// next/image <Image>.
if (typeof (globalThis as any).window.location === "undefined") {
  Object.defineProperty((globalThis as any).window, "location", {
    configurable: true,
    value: { href: "http://localhost/" },
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

async function main() {
  const { client } = await setupSignedInSupabase(
    document,
    { fullName: "Ada Lovelace", profile: { onboarding_completed: false } },
  );
  let getUserCalls = 0;
  const originalGetUser = client.auth.getUser;
  client.auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
    getUserCalls += 1;
    return originalGetUser(...args);
  }) as typeof client.auth.getUser;

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

  const { default: OnboardingPage } = await import("./page");

  await runTest("OnboardingPage pre-fills the name from context, calling getUser() 0 times", async () => {
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
            createElement(AuthProvider, null, createElement(OnboardingPage)),
          ),
        );
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      assert.equal(getUserCalls, 0, "OnboardingPage must not call supabase.auth.getUser()");
      const nameInput = document.querySelector('input#name') as HTMLInputElement | null;
      assert.ok(nameInput, "expected the name input to render");
      assert.equal(nameInput!.value, "Ada Lovelace");
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest(
    "TASK W3 Part 4b: OnboardingPage still renders a real ISO TIMESTAMP in the decorative panel",
    async () => {
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
              createElement(AuthProvider, null, createElement(OnboardingPage)),
            ),
          );
        });
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
        });
        assert.match(
          document.body.innerHTML,
          /TIMESTAMP: <span>\d{4}-\d{2}-\d{2}T[\d:.]+Z<\/span>/,
          "the decorative TIMESTAMP text still renders a real ISO date",
        );
      } finally {
        await act(async () => root.unmount());
      }
    },
  );

}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
