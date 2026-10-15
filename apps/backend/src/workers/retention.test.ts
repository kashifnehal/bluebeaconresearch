import assert from "node:assert/strict";

const { runServiceHealthRetentionOnce } = await import("./retention.js");

const BATCH = 5000;

function ids(count: number, prefix: string): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

function makeClient(nextPage: () => string[]) {
  const deleted: string[][] = [];
  let selects = 0;
  const client = {
    from(table: string) {
      if (table !== "service_health_events") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            lt() {
              return {
                limit() {
                  selects += 1;
                  return Promise.resolve({
                    data: nextPage().map((id) => ({ id })),
                    error: null,
                  });
                },
              };
            },
          };
        },
        delete() {
          return {
            in(_column: string, pageIds: string[]) {
              deleted.push(pageIds);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client, deleted, selectCount: () => selects };
}

let failed = false;
async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

await runTest("deletes old rows in batches and stops after a short page", async () => {
  const pages = [ids(BATCH, "a"), ids(10, "b")];
  const h = makeClient(() => pages.shift() ?? []);
  const result = await runServiceHealthRetentionOnce(h.client);
  assert.equal(result.ok, true);
  assert.equal(result.deleted, BATCH + 10);
  assert.equal(h.deleted.length, 2);
  assert.equal(h.deleted[0]?.length, BATCH);
  assert.equal(h.deleted[1]?.length, 10);
  assert.equal(h.selectCount(), 2);
});

await runTest("stops at 20 batches even when every page is full", async () => {
  const h = makeClient(() => ids(BATCH, "full"));
  const result = await runServiceHealthRetentionOnce(h.client);
  assert.equal(result.ok, true);
  assert.equal(result.deleted, BATCH * 20);
  assert.equal(h.deleted.length, 20);
  assert.equal(h.selectCount(), 20);
});

await runTest("does nothing when no rows are old", async () => {
  const h = makeClient(() => []);
  const result = await runServiceHealthRetentionOnce(h.client);
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 0);
  assert.equal(h.deleted.length, 0);
  assert.equal(h.selectCount(), 1);
});

if (failed) process.exitCode = 1;
