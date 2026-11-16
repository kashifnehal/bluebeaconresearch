import assert from "node:assert/strict";

import { HOMEPAGE_DB_TIMEOUT_MS, withTimeoutOrFallback } from "./with-timeout";

function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✔ ${name}`))
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  await runTest("a fast result is returned as is", async () => {
    const out = await withTimeoutOrFallback(Promise.resolve("live"), 200, "fallback");
    assert.equal(out, "live");
  });

  await runTest("a call that never settles returns the fallback after the timeout", async () => {
    const started = Date.now();
    const out = await withTimeoutOrFallback(new Promise<string>(() => {}), 50, "fallback");
    assert.equal(out, "fallback");
    assert.ok(Date.now() - started < 1000, "must not wait for the hung call");
  });

  await runTest("a slow call that finishes after the timeout does not replace the fallback", async () => {
    const slow = sleep(150).then(() => "late");
    const out = await withTimeoutOrFallback(slow, 30, "fallback");
    assert.equal(out, "fallback");
  });

  await runTest("a rejected call returns the fallback instead of throwing", async () => {
    const out = await withTimeoutOrFallback(Promise.reject(new Error("db down")), 200, 42);
    assert.equal(out, 42);
  });

  await runTest("the homepage timeout is a few seconds, well under the 125 s stall seen on 2026-11-16", () => {
    assert.ok(HOMEPAGE_DB_TIMEOUT_MS >= 1000 && HOMEPAGE_DB_TIMEOUT_MS <= 10000);
  });
}

void main();
