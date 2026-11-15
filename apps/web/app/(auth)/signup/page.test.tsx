// TASK W4 Part 4: SignupPage must not render the fabricated
// "Secure Node: BB-ALPHA-09" / "v4.22.0" decorative footer.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";

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

  if (typeof document.cookie !== "string") {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: () => {},
    });
  }

  const location = {
    pathname: "/signup",
    search: "",
    hash: "",
    hostname: "localhost",
    host: "localhost",
    protocol: "http:",
    origin: "http://localhost",
    href: "http://localhost/signup",
  };
  const g = globalThis as any;
  Object.defineProperty(g.window, "location", { configurable: true, value: location });
  Object.defineProperty(g, "location", { configurable: true, value: location });

  const { AppRouterContext } = await import(
    "next/dist/shared/lib/app-router-context.shared-runtime.js"
  );
  const { SearchParamsContext } = await import(
    "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
  );
  const { default: SignupPage } = await import("./page");

  const fakeRouter = {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  };

  await runTest("SignupPage does not render the fabricated Secure Node / version footer", async () => {
    const { root } = await renderElement(
      document,
      createElement(
        AppRouterContext.Provider,
        { value: fakeRouter },
        createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams("") },
          createElement(SignupPage),
        ),
      ),
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      assert.ok(document.querySelector("#email"), "expected the signup form to render");
      assert.doesNotMatch(document.body.innerHTML, /BB-ALPHA|Secure Node/);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
