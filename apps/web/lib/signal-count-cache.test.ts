import assert from "node:assert/strict";
import type { unstable_cache } from "next/cache";

import {
  buildSignalCountClient,
  createTotalSignalCountCache,
  describeThrownValue,
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
      select: () => ({
        abortSignal: async () => ({ count, error }),
      }),
    }),
  };
}

/** A client whose query never resolves on its own — only rejects once the
 *  AbortSignal it was given actually fires, the same way the real
 *  postgrest-js client behaves. Used to prove the timeout genuinely cancels
 *  the request rather than just racing it. */
function neverAnsweringClient(): SignalCountClient {
  return {
    from: () => ({
      select: () => ({
        abortSignal: (signal: AbortSignal) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
              const err = new Error("This operation was aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      }),
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

  await runTest(
    "fetchTotalSignalCountOrThrow genuinely cancels a hung request within the time limit, not just races it",
    async () => {
      // AbortSignal.timeout()'s internal timer is unref'd by Node's own
      // design, so when it is the only thing left pending, Node can (and in
      // this exact test file did, before this keep-alive) exit the process
      // early with no error and no console output at all — a silent gap,
      // not a failure. A real, ref'd timer keeps this test's event loop
      // open long enough to actually observe the abort fire.
      const keepAlive = setTimeout(() => {}, 500);
      try {
        const started = Date.now();
        await assert.rejects(fetchTotalSignalCountOrThrow(neverAnsweringClient(), 20));
        const elapsed = Date.now() - started;
        assert.ok(elapsed < 1000, `expected the abort to fire quickly, took ${elapsed}ms`);
      } finally {
        clearTimeout(keepAlive);
      }
    },
  );

  await runTest("fetchTotalSignalCountOrThrow still returns a real count well under the time limit", async () => {
    assert.equal(await fetchTotalSignalCountOrThrow(fakeClient(2996), 4000), 2996);
  });

  function withEnv(
    overrides: Record<string, string | undefined>,
    fn: () => void,
  ) {
    const keys = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    for (const k of keys) delete process.env[k];
    for (const [k, v] of Object.entries(overrides)) if (v !== undefined) process.env[k] = v;
    try {
      fn();
    } finally {
      for (const k of keys) {
        if (saved[k] !== undefined) process.env[k] = saved[k];
        else delete process.env[k];
      }
    }
  }

  await runTest("buildSignalCountClient returns null when no Supabase env vars are set", () => {
    withEnv({}, () => {
      assert.equal(buildSignalCountClient(), null);
    });
  });

  await runTest(
    "buildSignalCountClient returns null when only the anon key is set — it must never fall back to it",
    () => {
      withEnv(
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-value",
        },
        () => {
          assert.equal(buildSignalCountClient(), null);
        },
      );
    },
  );

  await runTest(
    "buildSignalCountClient returns a client when the URL and a service key are both set",
    () => {
      withEnv(
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-key-value",
        },
        () => {
          assert.ok(buildSignalCountClient());
        },
      );
    },
  );

  await runTest(
    "buildSignalCountClient also accepts SUPABASE_SECRET_KEY (Railway's legacy name)",
    () => {
      withEnv(
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SECRET_KEY: "secret-key-value",
        },
        () => {
          assert.ok(buildSignalCountClient());
        },
      );
    },
  );
  await runTest("describeThrownValue: the real evidence object (postgrest-shaped timeout) reads as a timeout", () => {
    const evidence = { message: "TimeoutError: The operation was aborted due to timeout", details: "", hint: "", code: "" };
    assert.equal(describeThrownValue(evidence, 4000), "timed out after 4000ms");
  });

  await runTest("describeThrownValue: an Error instance returns its message", () => {
    assert.equal(describeThrownValue(new Error("boom")), "boom");
  });

  await runTest("describeThrownValue: a string is returned as-is", () => {
    assert.equal(describeThrownValue("plain string reason"), "plain string reason");
  });

  await runTest("describeThrownValue: a plain object with only details (no message) returns the details string", () => {
    assert.equal(describeThrownValue({ details: "no rows found" }), "no rows found");
  });

  await runTest("describeThrownValue: null and undefined both return 'unknown error'", () => {
    assert.equal(describeThrownValue(null), "unknown error");
    assert.equal(describeThrownValue(undefined), "unknown error");
  });

  await runTest("describeThrownValue: a circular object does not throw", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    assert.doesNotThrow(() => describeThrownValue(circular));
  });

  await runTest("describeThrownValue: an unrelated object falls back to capped JSON.stringify", () => {
    const result = describeThrownValue({ foo: "bar" });
    assert.equal(result, JSON.stringify({ foo: "bar" }));
  });

  await runTest("describeThrownValue: a long string is capped at 200 characters", () => {
    const longString = "x".repeat(500);
    const result = describeThrownValue(longString);
    assert.ok(result.length <= 203, "expected the 200-char cap plus the '...' suffix");
    assert.ok(result.startsWith("xxx"));
  });
}

void main();
