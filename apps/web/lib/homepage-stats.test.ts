import assert from "node:assert/strict";

import {
  cachedHomepageSignalCount,
  loadHomepageSignalCount,
  resetHomepageStatsCacheForTests,
  type HomepageCountClient,
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

function fakeClient(responses: Array<{ count: number | null; error: unknown }>) {
  const selects: Array<{ table: string; columns: string; options: unknown }> = [];
  let i = 0;
  const client: HomepageCountClient = {
    from(table: string) {
      return {
        select(columns: string, options: { count: "exact"; head: true }) {
          selects.push({ table, columns, options });
          const next = responses[i] ?? responses[responses.length - 1];
          i += 1;
          return Promise.resolve(next);
        },
      };
    },
  };
  return { client, selects };
}

const realError = console.error;

async function main() {
  console.error = () => {};
  try {
    await runTest("homepage count uses head: true", async () => {
      resetHomepageStatsCacheForTests();
      const { client, selects } = fakeClient([{ count: 1280, error: null }]);
      const result = await loadHomepageSignalCount(client, 1_000);
      assert.deepEqual(result, { totalSignals: 1280 });
      assert.equal(selects.length, 1);
      assert.equal(selects[0].table, "signals");
      assert.equal(selects[0].columns, "id");
      assert.deepEqual(selects[0].options, { count: "exact", head: true });
    });

    await runTest("a cached value is returned when the second read fails", async () => {
      resetHomepageStatsCacheForTests();
      const { client } = fakeClient([
        { count: 1280, error: null },
        { count: null, error: { message: "canceling statement due to statement timeout" } },
      ]);
      const first = await loadHomepageSignalCount(client, 2_000);
      const second = await loadHomepageSignalCount(client, 2_500);
      assert.deepEqual(first, { totalSignals: 1280 });
      assert.deepEqual(second, { totalSignals: 1280 });
      assert.deepEqual(cachedHomepageSignalCount(2_500), { totalSignals: 1280 });
    });

    await runTest("a failed first read with no cache returns null", async () => {
      resetHomepageStatsCacheForTests();
      const { client } = fakeClient([{ count: null, error: { message: "timeout" } }]);
      const result = await loadHomepageSignalCount(client, 3_000);
      assert.deepEqual(result, { totalSignals: null });
    });
  } finally {
    console.error = realError;
    resetHomepageStatsCacheForTests();
  }
}

void main();
