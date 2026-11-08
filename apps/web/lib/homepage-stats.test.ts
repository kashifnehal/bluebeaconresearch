import assert from "node:assert/strict";

import {
  cachedHomepageSignalCount,
  loadHomepageSignalCount,
  resetHomepageStatsCacheForTests,
} from "./homepage-stats";

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

function fakeGetCount(responses: Array<number | Error>) {
  let i = 0;
  let calls = 0;
  const getCount = async () => {
    calls += 1;
    const next = responses[i] ?? responses[responses.length - 1];
    i += 1;
    if (next instanceof Error) throw next;
    return next;
  };
  return { getCount, callCount: () => calls };
}

const realError = console.error;

async function main() {
  console.error = () => {};
  try {
    await runTest("homepage count uses the shared getCount", async () => {
      resetHomepageStatsCacheForTests();
      const { getCount, callCount } = fakeGetCount([1280]);
      const result = await loadHomepageSignalCount(1_000, getCount);
      assert.deepEqual(result, { totalSignals: 1280 });
      assert.equal(callCount(), 1);
    });

    await runTest("a cached value is returned when the second read fails", async () => {
      resetHomepageStatsCacheForTests();
      const { getCount } = fakeGetCount([1280, new Error("canceling statement due to statement timeout")]);
      const first = await loadHomepageSignalCount(2_000, getCount);
      const second = await loadHomepageSignalCount(2_500, getCount);
      assert.deepEqual(first, { totalSignals: 1280 });
      assert.deepEqual(second, { totalSignals: 1280 });
      assert.deepEqual(cachedHomepageSignalCount(2_500), { totalSignals: 1280 });
    });

    await runTest("a failed first read with no cache returns null", async () => {
      resetHomepageStatsCacheForTests();
      const { getCount } = fakeGetCount([new Error("timeout")]);
      const result = await loadHomepageSignalCount(3_000, getCount);
      assert.deepEqual(result, { totalSignals: null });
    });
  } finally {
    console.error = realError;
    resetHomepageStatsCacheForTests();
  }
}

void main();
