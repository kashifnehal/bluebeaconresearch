import assert from "node:assert/strict";
import { recordDrops, type DropRecord } from "./drop-sample-store.js";

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

const sampleDrop: DropRecord = {
  feed: "BBC World",
  tier: "world",
  reason: "nokeyword",
  title: "A dropped headline about nothing relevant",
  summary: "some summary",
};

function supabaseThatThrows(): any {
  return {
    schema() {
      return {
        from() {
          throw new Error("table does not exist");
        },
      };
    },
  };
}

function supabaseThatShouldNeverBeCalled(): any {
  return {
    schema() {
      throw new Error("recordDrops should not touch supabase when the flag is off");
    },
  };
}

async function main() {
  const originalFlag = process.env.DROP_SAMPLE_STORE;

  await runTest("no-ops (never calls supabase) when DROP_SAMPLE_STORE is unset", async () => {
    delete process.env.DROP_SAMPLE_STORE;
    await recordDrops(supabaseThatShouldNeverBeCalled(), [sampleDrop]);
  });

  await runTest('no-ops when DROP_SAMPLE_STORE is "false"', async () => {
    process.env.DROP_SAMPLE_STORE = "false";
    await recordDrops(supabaseThatShouldNeverBeCalled(), [sampleDrop]);
  });

  await runTest("no-ops on an empty drops array even when the flag is on", async () => {
    process.env.DROP_SAMPLE_STORE = "true";
    await recordDrops(supabaseThatShouldNeverBeCalled(), []);
  });

  await runTest("never throws when the table/schema access itself throws", async () => {
    process.env.DROP_SAMPLE_STORE = "true";
    await recordDrops(supabaseThatThrows(), [sampleDrop]);
  });

  if (originalFlag === undefined) delete process.env.DROP_SAMPLE_STORE;
  else process.env.DROP_SAMPLE_STORE = originalFlag;
}

main();
