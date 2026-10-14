import assert from "node:assert/strict";
import {
  recordDrops,
  purgeOldDropSamples,
  classifyDrop,
  shouldRecordDrop,
  collectRelevanceDrop,
  __resetPurgeStateForTests,
  type DropRecord,
} from "./drop-sample-store.js";
import { dropReason } from "../lib/relevance-filter.js";

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
    from() {
      throw new Error("table does not exist");
    },
  };
}

function supabaseThatShouldNeverBeCalled(): any {
  return {
    from() {
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

  await runTest("a mocked client is never called with .schema(...) and purge runs at most once per hour", async () => {
    process.env.DROP_SAMPLE_STORE = "true";
    __resetPurgeStateForTests();
    let schemaCalls = 0;
    let deletes = 0;
    let cutoff = "";
    const sb: any = {
      schema() {
        schemaCalls++;
        throw new Error("no schema()");
      },
      from(table: string) {
        assert.equal(table, "rss_drop_samples");
        return {
          delete() {
            deletes++;
            return {
              lt: async (_col: string, v: string) => {
                cutoff = v;
                return { error: null };
              },
            };
          },
          insert: async () => ({ error: null }),
        };
      },
    };
    await recordDrops(sb, [sampleDrop]);
    await recordDrops(sb, [sampleDrop]);
    await purgeOldDropSamples(sb);
    assert.equal(schemaCalls, 0);
    assert.equal(deletes, 1, "purge must run once per hour per process");
    const ageDays = (Date.now() - new Date(cutoff).getTime()) / 86_400_000;
    assert.ok(Math.abs(ageDays - 14) < 0.01, `cutoff should be 14 days ago, got ${ageDays}`);
  });

  await runTest("purgeOldDropSamples never throws", async () => {
    __resetPurgeStateForTests();
    await purgeOldDropSamples(supabaseThatThrows());
  });

  await runTest("classifyDrop uses the same reason strings as the RSS block (exclude, noise, nokeyword)", () => {
    const ex = classifyDrop("Premier League football scores", "", "world");
    assert.equal(ex.reason, "exclude-phrase");
    assert.ok(ex.detail && ex.detail.includes("@"));
    assert.ok(dropReason("Premier League football scores", "", "world")!.startsWith("exclude:"));

    const noise = classifyDrop("Analyst raises price target on Acme stock", "", "world");
    assert.equal(noise.reason, "noise");

    const nk = classifyDrop("Local bakery wins a prize for sourdough", "", "world");
    assert.equal(nk.reason, "nokeyword");
    assert.ok(Array.isArray(nk.shadowGroups));
    assert.equal(typeof nk.midwordOnly, "boolean");
  });

  await runTest("shouldRecordDrop rules", () => {
    const withGroup = { reason: "nokeyword", shadowGroups: ["lithium"] };
    const noGroup = { reason: "nokeyword", shadowGroups: [] as string[] };
    assert.equal(shouldRecordDrop(withGroup, () => 0.99, 0), true, "shadow-group nokeyword always recorded");
    assert.equal(shouldRecordDrop(noGroup, () => 0.5, 0.1), false);
    assert.equal(shouldRecordDrop(noGroup, () => 0.05, 0.1), true);
    assert.equal(shouldRecordDrop({ reason: "noise" }, () => 0.5, 0.1), false);
    assert.equal(shouldRecordDrop({ reason: "exclude:x@title", shadowGroups: ["a"] }, () => 0.5, 0.1), false);
    assert.equal(shouldRecordDrop({ reason: "noise" }, () => 0.999, 1), true);
  });

  await runTest("with DROP_SAMPLE_STORE unset the GNews/GDELT drop path records nothing", async () => {
    delete process.env.DROP_SAMPLE_STORE;
    const records: DropRecord[] = [];
    collectRelevanceDrop(records, "gnews", "Local bakery wins a prize", "", undefined, 1, () => 0);
    collectRelevanceDrop(records, "gdelt", "Local bakery wins a prize", "", undefined, 1, () => 0);
    assert.equal(records.length, 0);
    await recordDrops(supabaseThatShouldNeverBeCalled(), records);
    process.env.DROP_SAMPLE_STORE = "true";
    collectRelevanceDrop(records, "gdelt", "Local bakery wins a prize", "", undefined, 1, () => 0);
    assert.equal(records.length, 1);
    assert.equal(records[0].feed, "gdelt");
    assert.equal(records[0].tier, "world");
  });

  if (originalFlag === undefined) delete process.env.DROP_SAMPLE_STORE;
  else process.env.DROP_SAMPLE_STORE = originalFlag;
}

main();
