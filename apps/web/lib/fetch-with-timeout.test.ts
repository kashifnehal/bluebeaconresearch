import assert from "node:assert/strict";

import { DATA_SLOW_MESSAGE, emptySignalsErrorBody, fetchJsonWithTimeout } from "./fetch-with-timeout";

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const originalFetch = globalThis.fetch;

function restore() {
  globalThis.fetch = originalFetch;
}

void (async () => {
  await runTest("fetchJsonWithTimeout returns JSON on success", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, n: 1 }), { status: 200 })) as typeof fetch;
    try {
      const body = await fetchJsonWithTimeout<{ ok: boolean; n: number }>("https://example.test/ok");
      assert.equal(body.ok, true);
      assert.equal(body.n, 1);
    } finally {
      restore();
    }
  });

  await runTest("fetchJsonWithTimeout throws fetch_failed when the response is not ok", async () => {
    globalThis.fetch = (async () => new Response("no", { status: 500 })) as typeof fetch;
    try {
      await assert.rejects(
        () => fetchJsonWithTimeout("https://example.test/fail"),
        (err: unknown) => err instanceof Error && err.message === "fetch_failed",
      );
    } finally {
      restore();
    }
  });

  await runTest("fetchJsonWithTimeout throws timeout when the request is aborted", async () => {
    globalThis.fetch = ((_: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as typeof fetch;
    try {
      await assert.rejects(
        () => fetchJsonWithTimeout("https://example.test/slow", { timeoutMs: 30 }),
        (err: unknown) => err instanceof Error && err.message === "timeout",
      );
    } finally {
      restore();
    }
  });

  await runTest("an empty signals error body stays a 200-shaped list and sets degraded", () => {
    const body = emptySignalsErrorBody();
    assert.deepEqual(body.signals, []);
    assert.equal(body.nextCursor, null);
    assert.equal(body.total, 0);
    assert.equal(body.degraded, true);
    assert.equal(
      DATA_SLOW_MESSAGE,
      "This is taking longer than usual. The data service is slow right now.",
    );
  });
})();
