// TASK W3 Part 4a — FirstTouchLogger used to fire logFunnelEventOnce (and so
// POST /api/events) even while signed out, which 401s with no session. It
// must now skip entirely while signed out, and still log exactly once after
// a user is actually signed in.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement } from "@/lib/test-render";
import { AuthContext } from "@/components/auth/AuthProvider";
import { FIRST_TOUCH_STORAGE_KEY } from "@/lib/first-touch";
import { FirstTouchLogger } from "./FirstTouchLogger";

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

function withFetchSpy<T>(run: (calls: Array<{ url: string; body: unknown }>) => Promise<T>) {
  const g = globalThis as any;
  const original = g.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];
  g.fetch = (url: string, init?: { body?: string }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return Promise.resolve({ ok: true, json: async () => ({}) });
  };
  return run(calls).finally(() => {
    g.fetch = original;
  });
}

function signedOutValue(isLoading: boolean) {
  return { user: null, session: null, profile: null, isLoading };
}

function signedInValue(id: string) {
  return {
    user: { id, email: "ada@example.com", user_metadata: {} } as any,
    session: null,
    profile: null,
    isLoading: false,
  };
}

async function main() {
  await runTest(
    "signed out: never calls /api/events, even once a touch is in sessionStorage",
    async () => {
      sessionStorage.setItem(
        FIRST_TOUCH_STORAGE_KEY,
        JSON.stringify({ utm_source: "newsletter" }),
      );
      await withFetchSpy(async (calls) => {
        const { root } = await renderElement(
          document,
          createElement(
            AuthContext.Provider,
            { value: signedOutValue(false) },
            createElement(FirstTouchLogger),
          ),
        );
        try {
          assert.equal(calls.length, 0, "no /api/events call while signed out");
        } finally {
          await act(async () => {
            root.unmount();
          });
        }
      });
      sessionStorage.removeItem(FIRST_TOUCH_STORAGE_KEY);
    },
  );

  await runTest("still loading auth: never calls /api/events", async () => {
    sessionStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify({ utm_source: "newsletter" }));
    await withFetchSpy(async (calls) => {
      const { root } = await renderElement(
        document,
        createElement(
          AuthContext.Provider,
          { value: signedOutValue(true) },
          createElement(FirstTouchLogger),
        ),
      );
      try {
        assert.equal(calls.length, 0, "no /api/events call while auth is still resolving");
      } finally {
        await act(async () => {
          root.unmount();
        });
      }
    });
    sessionStorage.removeItem(FIRST_TOUCH_STORAGE_KEY);
  });

  await runTest(
    "signed in with a stored touch: calls /api/events exactly once with first_touch_recorded",
    async () => {
      sessionStorage.setItem(
        FIRST_TOUCH_STORAGE_KEY,
        JSON.stringify({ utm_source: "newsletter" }),
      );
      await withFetchSpy(async (calls) => {
        const { root } = await renderElement(
          document,
          createElement(
            AuthContext.Provider,
            { value: signedInValue("user-signed-in") },
            createElement(FirstTouchLogger),
          ),
        );
        try {
          const eventCalls = calls.filter((c) => c.url === "/api/events");
          assert.equal(eventCalls.length, 1, "exactly one /api/events call once signed in");
          assert.equal((eventCalls[0].body as any).eventType, "first_touch_recorded");
          assert.equal((eventCalls[0].body as any).metadata.utm_source, "newsletter");
        } finally {
          await act(async () => {
            root.unmount();
          });
        }
      });
      sessionStorage.removeItem(FIRST_TOUCH_STORAGE_KEY);
    },
  );
}

void main();
