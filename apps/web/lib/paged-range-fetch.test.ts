import assert from "node:assert/strict";

import { fetchAllRangedRows } from "./paged-range-fetch";

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

async function main() {
  await runTest("a single short page stops after one call", async () => {
    let calls = 0;
    const result = await fetchAllRangedRows<number>(async (from, to) => {
      calls += 1;
      assert.equal(from, 0);
      assert.equal(to, 2);
      return { data: [1, 2], error: null };
    }, 3);
    assert.deepEqual(result.rows, [1, 2]);
    assert.equal(result.error, null);
    assert.equal(calls, 1);
  });

  await runTest("a full page triggers another request, which stops it", async () => {
    const calls: Array<[number, number]> = [];
    const result = await fetchAllRangedRows<number>(async (from, to) => {
      calls.push([from, to]);
      if (from === 0) return { data: [1, 2], error: null };
      return { data: [], error: null };
    }, 2);
    assert.deepEqual(result.rows, [1, 2]);
    assert.deepEqual(calls, [[0, 1], [2, 3]]);
  });

  await runTest("rows accumulate across several full pages", async () => {
    const pages = [[1, 2], [3, 4], [5]];
    let i = 0;
    const result = await fetchAllRangedRows<number>(async () => {
      const data = pages[i];
      i += 1;
      return { data, error: null };
    }, 2);
    assert.deepEqual(result.rows, [1, 2, 3, 4, 5]);
  });

  await runTest("an error on the first page returns no rows and the error message", async () => {
    const result = await fetchAllRangedRows<number>(async () => ({
      data: null,
      error: { message: "db_down" },
    }));
    assert.deepEqual(result.rows, []);
    assert.equal(result.error, "db_down");
  });

  await runTest("an error on a later page keeps the rows already collected", async () => {
    let call = 0;
    const result = await fetchAllRangedRows<number>(async () => {
      call += 1;
      if (call === 1) return { data: [1, 2], error: null };
      return { data: null, error: { message: "boom" } };
    }, 2);
    assert.deepEqual(result.rows, [1, 2]);
    assert.equal(result.error, "boom");
  });

  await runTest("a null data page is treated as empty, not an error", async () => {
    const result = await fetchAllRangedRows<number>(async () => ({ data: null, error: null }));
    assert.deepEqual(result.rows, []);
    assert.equal(result.error, null);
  });
}

void main();
