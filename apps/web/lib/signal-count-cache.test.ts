import assert from "node:assert/strict";
import type { unstable_cache } from "next/cache";

import {
  buildSignalCountClient,
  createTotalSignalCountCache,
  fetchTotalSignalCountOrThrow,
  type SignalCountClient,
} from "./signal-count-cache";

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

/**
 * Mimics unstable_cache's documented contract (once per revalidate window,
 * never stores a thrown rejection) without needing Next's request runtime,
 * which the real unstable_cache requires even to be called.
 */
function fakeWrap<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  _keyParts: string[],
  options: { revalidate: number },
): T {
  let cached: { value: unknown; storedAt: number } | null = null;
  const wrapped = (async (...args: unknown[]) => {
    const now = Date.now();
    if (cached && now - cached.storedAt < options.revalidate * 1000) {
      return cached.value;
    }
    const value = await fn(...args);
    cached = { value, storedAt: now };
    return value;
  }) as T;
  return wrapped;
}

function fakeClient(count: number | null, error: unknown = null): SignalCountClient {
  return {
    from: () => ({
      select: async () => ({ count, error }),
    }),
  };
}

async function main() {
  await runTest("the cached function calls the database once for two calls inside the window", async () => {
    let dbCalls = 0;
    const fetchImpl = async () => {
      dbCalls += 1;
      return 1234;
    };
    const cached = createTotalSignalCountCache(fetchImpl, fakeWrap as unknown as typeof unstable_cache);
    assert.equal(await cached(), 1234);
    assert.equal(await cached(), 1234);
    assert.equal(dbCalls, 1);
  });

  await runTest("a failing database read is not cached — the next call retries", async () => {
    let dbCalls = 0;
    const fetchImpl = async () => {
      dbCalls += 1;
      if (dbCalls === 1) throw new Error("boom");
      return 999;
    };
    const cached = createTotalSignalCountCache(fetchImpl, fakeWrap as unknown as typeof unstable_cache);
    await assert.rejects(cached());
    assert.equal(await cached(), 999);
    assert.equal(dbCalls, 2);
  });

  await runTest("fetchTotalSignalCountOrThrow throws on a zero count instead of returning it", async () => {
    await assert.rejects(fetchTotalSignalCountOrThrow(fakeClient(0)));
  });

  await runTest("fetchTotalSignalCountOrThrow throws on a null count", async () => {
    await assert.rejects(fetchTotalSignalCountOrThrow(fakeClient(null)));
  });

  await runTest("fetchTotalSignalCountOrThrow throws on a query error", async () => {
    await assert.rejects(fetchTotalSignalCountOrThrow(fakeClient(null, new Error("statement timeout"))));
  });

  await runTest("fetchTotalSignalCountOrThrow returns a real positive count", async () => {
    assert.equal(await fetchTotalSignalCountOrThrow(fakeClient(2996)), 2996);
  });

  await runTest("buildSignalCountClient returns null when no Supabase env vars are set", () => {
    const saved = {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      service: process.env.SUPABASE_SERVICE_ROLE_KEY,
      secret: process.env.SUPABASE_SECRET_KEY,
      anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      assert.equal(buildSignalCountClient(), null);
    } finally {
      if (saved.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
      if (saved.service !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved.service;
      if (saved.secret !== undefined) process.env.SUPABASE_SECRET_KEY = saved.secret;
      if (saved.anon !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.anon;
    }
  });
}

void main();
