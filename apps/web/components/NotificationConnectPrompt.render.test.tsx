// TASK W7 Part 1: regression test for a second /api/telegram/status call on
// one signed-in dashboard load. AuthProvider.resolveSession() replaces the
// `user` object with a new one (same id) on every auth event for an
// already-resolved user (e.g. a token refresh) — this component's
// eligibility effect used to depend on that object directly, so it re-ran,
// and refetched, on each such event. Fixed by depending on `user?.id`
// instead. Linkedom + react-dom/client harness, same pattern as
// components/signals/SignalQuickView.test.tsx.
import assert from "node:assert/strict";
import { createElement } from "react";
import { act } from "react";

import { setupDom, renderElement, setupSignedInSupabase } from "@/lib/test-render";
import { AuthContext } from "@/components/auth/AuthProvider";
import { NotificationConnectPrompt } from "./NotificationConnectPrompt";

const document = setupDom();

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function authValue(user: { id: string; email: string } | null) {
  return {
    user: user as any,
    session: user ? ({ user } as any) : null,
    profile: null,
    isLoading: false,
  };
}

function countTelegramStatusCalls(calls: string[]): number {
  return calls.filter((c) => c === "/api/telegram/status").length;
}

async function main() {
  // Stubs the browser supabase client's `.from("profiles")` call the
  // component's eligibility effect also makes, and the env vars/cookie
  // getter it needs to exist at all — this test drives useAuth() directly
  // via AuthContext.Provider rather than mounting the real AuthProvider.
  await setupSignedInSupabase(document);

  await runTest(
    "re-rendering with a NEW user object of the SAME id calls /api/telegram/status exactly once",
    async () => {
      const calls: string[] = [];
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        calls.push(String(input).split("?")[0]);
        return new Response(JSON.stringify({ telegramConnected: false }), { status: 200 });
      }) as typeof fetch;

      const userA = { id: "user-1", email: "ada@example.com" };
      // A distinct object, same id — mirrors resolveSession() handing the
      // provider's state a fresh `user` reference for an already-known id.
      const userASameId = { id: "user-1", email: "ada@example.com" };

      const { root } = await renderElement(
        document,
        createElement(
          AuthContext.Provider,
          { value: authValue(userA) },
          createElement(NotificationConnectPrompt),
        ),
      );

      try {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
        });
        assert.equal(countTelegramStatusCalls(calls), 1, "initial mount");

        await act(async () => {
          root.render(
            createElement(
              AuthContext.Provider,
              { value: authValue(userASameId) },
              createElement(NotificationConnectPrompt),
            ),
          );
        });
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
        });

        assert.equal(
          countTelegramStatusCalls(calls),
          1,
          "a new user object with the same id must not re-trigger the eligibility fetch",
        );
      } finally {
        globalThis.fetch = original;
        await act(async () => root.unmount());
      }
    },
  );

  await runTest(
    "re-rendering with a DIFFERENT user id calls /api/telegram/status again",
    async () => {
      const calls: string[] = [];
      const original = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        calls.push(String(input).split("?")[0]);
        return new Response(JSON.stringify({ telegramConnected: false }), { status: 200 });
      }) as typeof fetch;

      const userA = { id: "user-1", email: "ada@example.com" };
      const userB = { id: "user-2", email: "grace@example.com" };

      const { root } = await renderElement(
        document,
        createElement(
          AuthContext.Provider,
          { value: authValue(userA) },
          createElement(NotificationConnectPrompt),
        ),
      );

      try {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
        });
        assert.equal(countTelegramStatusCalls(calls), 1, "initial mount");

        await act(async () => {
          root.render(
            createElement(
              AuthContext.Provider,
              { value: authValue(userB) },
              createElement(NotificationConnectPrompt),
            ),
          );
        });
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
        });

        assert.equal(
          countTelegramStatusCalls(calls),
          2,
          "switching to a genuinely different signed-in user must refetch",
        );
      } finally {
        globalThis.fetch = original;
        await act(async () => root.unmount());
      }
    },
  );
}

main().then(() => {
  process.exit(process.exitCode ?? 0);
});
