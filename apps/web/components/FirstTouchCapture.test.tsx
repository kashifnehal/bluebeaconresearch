// Rendered path: FirstTouchCapture stores the landing query, then the signup
// page attaches that stored value on the sign-up call. Does not change
// FirstTouchCapture or first-touch.ts.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { FIRST_TOUCH_STORAGE_KEY, parseFirstTouch, readFirstTouch } from "@/lib/first-touch";

const document = setupDom();

const SEARCH = "?utm_source=linkedin&utm_medium=document&utm_campaign=test";

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
  const g = globalThis as any;
  const storage = g.window.sessionStorage;
  g.sessionStorage = storage;
  const location = {
    pathname: "/",
    search: SEARCH,
    hash: "",
    hostname: "localhost",
    host: "localhost",
    protocol: "http:",
    origin: "http://localhost",
    href: `http://localhost/${SEARCH}`,
  };
  Object.defineProperty(g.window, "location", { configurable: true, value: location });
  Object.defineProperty(g, "location", { configurable: true, value: location });
  try {
    Object.defineProperty(document, "referrer", { configurable: true, value: "" });
  } catch {
    // linkedom may already expose an empty referrer
  }

  if (typeof document.cookie !== "string") {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get: () => "",
      set: () => {},
    });
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

  const signUpCalls: unknown[] = [];
  const emailAuth = await import("@/lib/supabase-email-auth");
  const emailClient = emailAuth.getSupabaseEmailAuthClient();
  assert.ok(emailClient, "email auth client was not created");
  emailClient.auth.signUp = (async (args: unknown) => {
    signUpCalls.push(args);
    return { data: { user: { id: "user-1" }, session: null }, error: null };
  }) as typeof emailClient.auth.signUp;

  const browser = await import("@/lib/supabase");
  const browserClient = browser.getSupabaseBrowserClient();
  if (browserClient) {
    browserClient.auth.getSession = (async () => ({ data: { session: null }, error: null })) as typeof browserClient.auth.getSession;
  }

  await runTest("FirstTouchCapture stores nothing without analytics consent", async () => {
    g.window.localStorage.removeItem("bbr.consent");
    storage.removeItem(FIRST_TOUCH_STORAGE_KEY);
    const { FirstTouchCapture } = await import("./FirstTouchCapture");
    const { root } = await renderElement(document, createElement(FirstTouchCapture));
    try {
      assert.equal(storage.getItem(FIRST_TOUCH_STORAGE_KEY), null);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("FirstTouchCapture stores the landing utm values", async () => {
    g.window.localStorage.setItem(
      "bbr.consent",
      JSON.stringify({ v: 1, analytics: true, at: "2026-11-07T00:00:00.000Z" }),
    );
    const { FirstTouchCapture } = await import("./FirstTouchCapture");
    const { root } = await renderElement(document, createElement(FirstTouchCapture));
    try {
      const expected = parseFirstTouch(SEARCH, document.referrer ?? "", location.hostname);
      const raw = storage.getItem(FIRST_TOUCH_STORAGE_KEY);
      assert.ok(raw, "nothing was written to session storage");
      assert.deepEqual(JSON.parse(raw), expected);
      assert.deepEqual(readFirstTouch(), expected);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("signup attaches the stored first touch on the sign-up call", async () => {
    const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime.js");
    const { SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime.js");
    const { default: SignupPage } = await import("../app/(auth)/signup/page");
    const expected = readFirstTouch();
    assert.ok(expected);

    const { root } = await renderElement(
      document,
      createElement(
        AppRouterContext.Provider,
        {
          value: {
            push: () => {},
            replace: () => {},
            back: () => {},
            forward: () => {},
            refresh: () => {},
            prefetch: async () => {},
          },
        },
        createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams("") },
          createElement(SignupPage),
        ),
      ),
    );
    try {
      const name = document.querySelector("#fullName") as HTMLInputElement;
      const email = document.querySelector("#email") as HTMLInputElement;
      const password = document.querySelector("#password") as HTMLInputElement;
      const form = document.querySelector("form");
      assert.ok(name && email && password && form);
      await act(async () => {
        typeInto(name, "Ada Lovelace");
        typeInto(email, "ada@example.com");
        typeInto(password, "correct-horse");
      });
      await act(async () => {
        reactProps(form).onSubmit({ preventDefault() {}, persist() {} });
      });
      assert.equal(signUpCalls.length, 1, "signup did not call signUp");
      const call = signUpCalls[0] as {
        options?: { data?: { first_touch?: unknown } };
      };
      assert.deepEqual(call.options?.data?.first_touch, expected);
    } finally {
      await act(async () => root.unmount());
    }
  });

  await runTest("signup reads utm values from the current address when nothing is stored", async () => {
    g.window.localStorage.removeItem("bbr.consent");
    storage.removeItem(FIRST_TOUCH_STORAGE_KEY);
    assert.equal(readFirstTouch(), null);
    const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime.js");
    const { SearchParamsContext } = await import("next/dist/shared/lib/hooks-client-context.shared-runtime.js");
    const { default: SignupPage } = await import("../app/(auth)/signup/page");
    const fromUrl = parseFirstTouch(SEARCH, "", location.hostname);
    assert.ok(fromUrl);

    const { root } = await renderElement(
      document,
      createElement(
        AppRouterContext.Provider,
        {
          value: {
            push: () => {},
            replace: () => {},
            back: () => {},
            forward: () => {},
            refresh: () => {},
            prefetch: async () => {},
          },
        },
        createElement(
          SearchParamsContext.Provider,
          { value: new URLSearchParams("") },
          createElement(SignupPage),
        ),
      ),
    );
    try {
      const name = document.querySelector("#fullName") as HTMLInputElement;
      const email = document.querySelector("#email") as HTMLInputElement;
      const password = document.querySelector("#password") as HTMLInputElement;
      const form = document.querySelector("form");
      assert.ok(name && email && password && form);
      await act(async () => {
        typeInto(name, "Ada Lovelace");
        typeInto(email, "ada@example.com");
        typeInto(password, "correct-horse");
      });
      await act(async () => {
        reactProps(form).onSubmit({ preventDefault() {}, persist() {} });
      });
      assert.equal(signUpCalls.length, 2);
      const call = signUpCalls[1] as {
        options?: { data?: { first_touch?: unknown } };
      };
      assert.deepEqual(call.options?.data?.first_touch, fromUrl);
      assert.equal(storage.getItem(FIRST_TOUCH_STORAGE_KEY), null);
    } finally {
      await act(async () => root.unmount());
    }
  });
}

main().then(() => {
  // The Supabase auth client starts a refresh timer. Exit so the test chain continues.
  process.exit(process.exitCode ?? 0);
});
