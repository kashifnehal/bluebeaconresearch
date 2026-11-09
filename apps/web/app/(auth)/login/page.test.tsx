// Rendered coverage for TASK W-AUTH Part 3a: the login button's loading
// state must stay on (full-screen "Signing you in" overlay, see
// isLoading/signing-in-overlay in page.tsx) from click until the browser
// actually navigates — it must NOT flip back off after a successful sign-in
// once window.location.href is set, which used to happen via a blanket
// `finally { setIsLoading(false) }`.
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

function reactProps(el: Element): any {
  const propsKey = Object.getOwnPropertyNames(el).find((k) => k.startsWith("__reactProps$"));
  return propsKey ? (el as any)[propsKey] : null;
}

function typeInto(el: Element, value: string) {
  const props = reactProps(el);
  assert.ok(props?.onChange, "input is missing onChange");
  props.onChange({ target: { value, name: (el as HTMLInputElement).name } });
}

async function main() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  // @supabase/ssr's browser client reads document.cookie on construction —
  // same linkedom gap as components/FirstTouchCapture.test.tsx.
  if (typeof document.cookie !== "string") {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: () => {},
    });
  }

  const location = {
    pathname: "/login",
    search: "",
    hash: "",
    hostname: "localhost",
    host: "localhost",
    protocol: "http:",
    origin: "http://localhost",
    href: "http://localhost/login",
  };
  const g = globalThis as any;
  Object.defineProperty(g.window, "location", { configurable: true, value: location });
  Object.defineProperty(g, "location", { configurable: true, value: location });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;

  const browser = await import("@/lib/supabase");
  const browserClient = browser.getSupabaseBrowserClient();
  assert.ok(browserClient, "browser client was not created");

  // The mount-time "redirect already-logged-in users away" effect reads
  // getSession() — resolve it to "no session" so the login form actually
  // renders instead of bouncing to /dashboard.
  browserClient.auth.getSession = (async () => ({
    data: { session: null },
    error: null,
  })) as typeof browserClient.auth.getSession;

  let signInCalls = 0;
  browserClient.auth.signInWithPassword = (async () => {
    signInCalls += 1;
    return { data: { user: { id: "user-1" }, session: {} }, error: null };
  }) as unknown as typeof browserClient.auth.signInWithPassword;

  const { AppRouterContext } = await import(
    "next/dist/shared/lib/app-router-context.shared-runtime.js"
  );
  const { SearchParamsContext } = await import(
    "next/dist/shared/lib/hooks-client-context.shared-runtime.js"
  );
  const { default: LoginPage } = await import("./page");

  const fakeRouter = {
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: async () => {},
  };

  function renderLogin() {
    return renderElement(
      document,
      createElement(
        AppRouterContext.Provider,
        { value: fakeRouter },
        createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams("") },
          createElement(LoginPage),
        ),
      ),
    );
  }

  await runTest(
    "the sign-in loading state stays on after a successful submit, through the window.location.href navigation",
    async () => {
      // isProjectReady is false in this test env (PROJECT_READY/
      // NEXT_PUBLIC_PROJECT_READY unset) -- onSubmit skips fetchMyProfile()
      // and resolvePostAuthRedirect(null, null) resolves to "/", which is
      // exactly the branch this test needs: no profiles-table mock required.
      const { root } = await renderLogin();
      try {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });

        const email = document.querySelector("#email") as HTMLInputElement;
        const password = document.querySelector("#password") as HTMLInputElement;
        const form = document.querySelector("form");
        assert.ok(email && password && form, "expected the login form to render");

        await act(async () => {
          typeInto(email, "ada@example.com");
          typeInto(password, "correct-horse");
        });

        assert.equal(
          document.body.innerHTML.includes('data-testid="signing-in-overlay"'),
          false,
          "overlay must not show before submit",
        );

        await act(async () => {
          reactProps(form).onSubmit({ preventDefault() {}, persist() {} });
        });
        // Let the signInWithPassword/register-session/redirect promise chain settle.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
        });

        assert.equal(signInCalls, 1, "signInWithPassword was not called");
        assert.equal(
          location.href,
          "/",
          "window.location.href should be set to the resolved post-auth redirect",
        );
        assert.equal(
          document.body.innerHTML.includes('data-testid="signing-in-overlay"'),
          true,
          "the full-screen Signing you in overlay must still be showing after a successful submit",
        );
        assert.match(document.body.textContent ?? "", /Signing you in/);
        // The form itself (email input) must be gone -- the overlay replaces
        // it, it doesn't sit on top of it.
        assert.equal(document.querySelector("#email"), null);
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
