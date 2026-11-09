// Route coverage for TASK W-AUTH Part 3b/3c: the shortened code-exchange
// chain, the after()-deferred instrumentation, and the no-vendor-text
// signin_failed redirect for a missing code or a failed exchange.
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthCallbackDeps } from "./route";

// lib/flags.ts's isProjectReady is a module-load-time constant, not a
// function — it must be set before the dynamic import below, not just
// before each test case.
process.env.PROJECT_READY = "true";

function runTest(name: string, fn: () => Promise<void> | void) {
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

function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    delete: () => builder,
    in: () => Promise.resolve(result),
    insert: () => Promise.resolve(result),
    upsert: () => Promise.resolve(result),
  };
  return builder;
}

function makeDeps(overrides: {
  exchangeError?: { message: string };
  user?: { id: string } | null;
  onboardingCompleted?: boolean;
} = {}) {
  const calls = {
    exchangeCodeForSession: 0,
    getUser: 0,
    afterTasks: 0,
    trackSignupCompletedOnce: 0,
    recordSessionBookkeeping: 0,
  };

  const user = overrides.user === undefined ? { id: "user-1" } : overrides.user;

  const fakeClient = {
    auth: {
      exchangeCodeForSession: async () => {
        calls.exchangeCodeForSession += 1;
        if (overrides.exchangeError) return { error: overrides.exchangeError };
        return { error: null };
      },
      getUser: async () => {
        calls.getUser += 1;
        return { data: { user } };
      },
      getSession: async () => ({ data: { session: null } }),
    },
    from: (_table: string) =>
      makeQueryBuilder({
        data: { onboarding_completed: overrides.onboardingCompleted ?? false },
        error: null,
      }),
  } as unknown as SupabaseClient;

  const deps: AuthCallbackDeps = {
    createClient: () => fakeClient,
    // Runs the deferred task immediately (awaited) instead of actually
    // deferring past the response — after() itself requires a real Next.js
    // request context and throws when a route handler is called directly,
    // which is exactly why this is a DI seam.
    after: (task) => {
      calls.afterTasks += 1;
      void task();
    },
    trackSignupCompletedOnce: async () => {
      calls.trackSignupCompletedOnce += 1;
    },
    recordSessionBookkeeping: async () => {
      calls.recordSessionBookkeeping += 1;
    },
  };

  return { deps, calls, fakeClient };
}

function redirectLocation(res: Response): string {
  const loc = res.headers.get("location");
  assert.ok(loc, "expected a redirect Location header");
  return loc!;
}

async function main() {
  const { GET } = await import("./route");

  await runTest("no code redirects to /login?error=signin_failed without touching supabase", async () => {
    const { deps, calls } = makeDeps();
    const req = new NextRequest("https://app.example.com/auth/callback");
    const res = await GET(req, { params: Promise.resolve({}) }, deps);
    assert.equal(res.status, 307);
    assert.match(redirectLocation(res), /\/login\?error=signin_failed$/);
    assert.equal(calls.exchangeCodeForSession, 0, "no code means no exchange attempt");
    assert.equal(calls.afterTasks, 0, "no user means no deferred instrumentation");
  });

  await runTest(
    "a failed exchange redirects to /login?error=signin_failed, never leaking the vendor error message",
    async () => {
      const { deps, calls } = makeDeps({ exchangeError: { message: "invalid_grant: bad code_verifier" } });
      const req = new NextRequest("https://app.example.com/auth/callback?code=abc123");
      const res = await GET(req, { params: Promise.resolve({}) }, deps);
      assert.equal(res.status, 307);
      const location = redirectLocation(res);
      assert.match(location, /\/login\?error=signin_failed$/);
      assert.equal(location.includes("invalid_grant"), false, "vendor error text must not reach the URL");
      assert.equal(calls.exchangeCodeForSession, 1);
      assert.equal(calls.afterTasks, 0, "a failed exchange never reaches the deferred instrumentation step");
    },
  );

  await runTest(
    "a successful exchange for an onboarded user redirects to /dashboard and defers instrumentation via after()",
    async () => {
      const { deps, calls } = makeDeps({ onboardingCompleted: true });
      const req = new NextRequest("https://app.example.com/auth/callback?code=abc123");
      const res = await GET(req, { params: Promise.resolve({}) }, deps);
      assert.equal(res.status, 307);
      assert.match(redirectLocation(res), /\/dashboard$/);
      assert.equal(calls.exchangeCodeForSession, 1);
      assert.equal(calls.getUser, 1);
      assert.equal(calls.afterTasks, 1, "instrumentation must run through the after() seam, not inline");
      assert.equal(calls.trackSignupCompletedOnce, 1);
      assert.equal(calls.recordSessionBookkeeping, 1);
    },
  );

  await runTest(
    "a successful exchange for a not-yet-onboarded user redirects to /onboarding",
    async () => {
      const { deps } = makeDeps({ onboardingCompleted: false });
      const req = new NextRequest("https://app.example.com/auth/callback?code=abc123");
      const res = await GET(req, { params: Promise.resolve({}) }, deps);
      assert.match(redirectLocation(res), /\/onboarding$/);
    },
  );

  await runTest(
    "an OAuth provider error param still redirects with its own description, untouched by Part 3c",
    async () => {
      const { deps } = makeDeps();
      const req = new NextRequest(
        "https://app.example.com/auth/callback?error=access_denied&error_description=User%20cancelled",
      );
      const res = await GET(req, { params: Promise.resolve({}) }, deps);
      assert.match(redirectLocation(res), /\/login\?error=User(%20|\+)cancelled$/);
    },
  );
}

void main();
