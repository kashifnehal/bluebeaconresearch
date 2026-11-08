import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { runServiceHealthRetentionOnce, SERVICE_HEALTH_KEEP_SERVICES } = await import("./retention.js");

type RpcResult = { data: number | null; error: { message: string; code?: string } | null };

function makeClient(handler: (callIndex: number) => RpcResult) {
  const calls: Array<{ p_cutoff: string; p_batch: number }> = [];
  const client = {
    rpc(fn: "prune_service_health_events", args: { p_cutoff: string; p_batch: number }) {
      if (fn !== "prune_service_health_events") throw new Error(`unexpected rpc ${fn}`);
      const callIndex = calls.length;
      calls.push(args);
      return Promise.resolve(handler(callIndex));
    },
  };
  return { client, calls };
}

function makeSleep() {
  const waits: number[] = [];
  return {
    sleep: async (ms: number) => {
      waits.push(ms);
    },
    waits,
  };
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

await runTest("loops until a batch returns fewer than 2000, calling only rpc (no delete/from on the client)", async () => {
  const { client, calls } = makeClient((i) => (i === 0 ? { data: 2000, error: null } : { data: 10, error: null }));
  const { sleep, waits } = makeSleep();
  const result = await runServiceHealthRetentionOnce(client, sleep);
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 2010);
  assert.equal(calls.length, 2);
  assert.deepEqual(Object.keys(client), ["rpc"]);
  assert.deepEqual(waits, [1000]);
});

await runTest("stops at 10 batches even when every batch is full", async () => {
  const { client, calls } = makeClient(() => ({ data: 2000, error: null }));
  const { sleep, waits } = makeSleep();
  const result = await runServiceHealthRetentionOnce(client, sleep);
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 2000 * 10);
  assert.equal(calls.length, 10);
  assert.equal(waits.length, 9);
});

await runTest("a missing function (PGRST202) returns ok false and makes no further calls", async () => {
  const { client, calls } = makeClient(() => ({ data: null, error: { message: "not found", code: "PGRST202" } }));
  const { sleep } = makeSleep();
  const result = await runServiceHealthRetentionOnce(client, sleep);
  assert.equal(result.ok, false);
  assert.equal(result.error, "prune function missing");
  assert.equal(result.deleted, 0);
  assert.equal(calls.length, 1);
});

await runTest("another rpc error stops the run and reports the deleted count so far", async () => {
  const { client, calls } = makeClient((i) =>
    i === 0 ? { data: 2000, error: null } : { data: null, error: { message: "connection reset" } },
  );
  const { sleep, waits } = makeSleep();
  const result = await runServiceHealthRetentionOnce(client, sleep);
  assert.equal(result.ok, false);
  assert.equal(result.error, "connection reset");
  assert.equal(result.deleted, 2000);
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [1000]);
});

await runTest("does nothing when the first batch is already empty", async () => {
  const { client, calls } = makeClient(() => ({ data: 0, error: null }));
  const { sleep } = makeSleep();
  const result = await runServiceHealthRetentionOnce(client, sleep);
  assert.equal(result.ok, true);
  assert.equal(result.deleted, 0);
  assert.equal(calls.length, 1);
});

await runTest("the migration keeps the same service list as SERVICE_HEALTH_KEEP_SERVICES", async () => {
  const here = fileURLToPath(import.meta.url);
  const migrationsDir = join(here, "..", "..", "..", "..", "..", "supabase", "migrations");
  const file = readdirSync(migrationsDir).find((f) => f.endsWith("_prune_service_health_events.sql"));
  assert.ok(file, "expected a *_prune_service_health_events.sql migration file");
  const sql = readFileSync(join(migrationsDir, file as string), "utf8");
  const keepListMatch = sql.match(/and e\.service not in \(([\s\S]*?)\)/);
  assert.ok(keepListMatch, "expected a keep-list `not in (...)` clause in the migration");
  const namesInSql = Array.from((keepListMatch as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
  assert.deepEqual(new Set(namesInSql), new Set(SERVICE_HEALTH_KEEP_SERVICES));
});

if (failed) process.exitCode = 1;
