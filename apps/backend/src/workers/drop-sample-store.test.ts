import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

  /** Mocked client: `select().or()` reports which (feed, title_hash) pairs in
   *  `existingRows` already exist; records insert/update/delete calls. */
  function mockClient(existingRows: Array<{ feed: string; title_hash: string; seen_count: number }>) {
    const calls = { schema: 0, deletes: 0, selects: 0, inserts: 0, updates: 0 };
    let lastInsertRows: any[] = [];
    let insertError: { code?: string; message: string } | null = null;
    let selectError: { message: string } | null = null;
    let cutoff = "";
    const sb: any = {
      schema() {
        calls.schema++;
        throw new Error("no schema()");
      },
      from(table: string) {
        assert.equal(table, "rss_drop_samples");
        return {
          delete() {
            calls.deletes++;
            return {
              lt: async (_col: string, v: string) => {
                cutoff = v;
                return { error: null };
              },
            };
          },
          select() {
            calls.selects++;
            return {
              or: async (_filter: string) => {
                if (selectError) return { data: null, error: selectError };
                return { data: existingRows, error: null };
              },
            };
          },
          insert: async (rows: any[]) => {
            calls.inserts++;
            lastInsertRows = rows;
            return { error: insertError };
          },
          update(_patch: any) {
            calls.updates++;
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
        };
      },
    };
    return {
      sb,
      calls,
      cutoff: () => cutoff,
      insertedRows: () => lastInsertRows,
      setInsertError: (e: { code?: string; message: string } | null) => (insertError = e),
      setSelectError: (e: { message: string } | null) => (selectError = e),
    };
  }

  await runTest("a mocked client is never called with .schema(...) and purge runs at most once per hour", async () => {
    process.env.DROP_SAMPLE_STORE = "true";
    __resetPurgeStateForTests();
    const m = mockClient([]);
    await recordDrops(m.sb, [sampleDrop]);
    await recordDrops(m.sb, [sampleDrop]);
    await purgeOldDropSamples(m.sb);
    assert.equal(m.calls.schema, 0);
    assert.equal(m.calls.deletes, 1, "purge must run once per hour per process");
    const ageDays = (Date.now() - new Date(m.cutoff()).getTime()) / 86_400_000;
    assert.ok(Math.abs(ageDays - 14) < 0.01, `cutoff should be 14 days ago, got ${ageDays}`);
  });

  await runTest("purgeOldDropSamples never throws", async () => {
    __resetPurgeStateForTests();
    await purgeOldDropSamples(supabaseThatThrows());
  });

  await runTest("one batched select, and rows that already exist cause zero insert calls", async () => {
    process.env.DROP_SAMPLE_STORE = "true";
    __resetPurgeStateForTests();
    const hash = createHash("sha1").update(sampleDrop.title.trim().toLowerCase()).digest("hex");
    const m = mockClient([{ feed: sampleDrop.feed, title_hash: hash, seen_count: 3 }]);
    await recordDrops(m.sb, [sampleDrop]);
    assert.equal(m.calls.selects, 1, "exactly one batched select");
    assert.equal(m.calls.updates, 1);
    assert.equal(m.calls.inserts, 0, "an already-seen row must not be inserted");
  });

  await runTest("new rows cause exactly one batched insert call", async () => {
    process.env.DROP_SAMPLE_STORE = "true";
    __resetPurgeStateForTests();
    const m = mockClient([]);
    await recordDrops(m.sb, [sampleDrop, { ...sampleDrop, title: "A second, different dropped headline" }]);
    assert.equal(m.calls.selects, 1);
    assert.equal(m.calls.updates, 0);
    assert.equal(m.calls.inserts, 1, "both new rows go in a single batched insert call");
    assert.equal(m.insertedRows().length, 2);
  });

  await runTest("a select error does not throw and writes nothing", async () => {
    process.env.DROP_SAMPLE_STORE = "true";
    __resetPurgeStateForTests();
    const m = mockClient([]);
    m.setSelectError({ message: "relation \"rss_drop_samples\" does not exist" });
    await recordDrops(m.sb, [sampleDrop]);
    assert.equal(m.calls.inserts, 0);
    assert.equal(m.calls.updates, 0);
  });

  await runTest("a 23505 on the batched insert does not throw (two workers raced)", async () => {
    process.env.DROP_SAMPLE_STORE = "true";
    __resetPurgeStateForTests();
    const m = mockClient([]);
    m.setInsertError({ code: "23505", message: "duplicate key value violates unique constraint" });
    await recordDrops(m.sb, [sampleDrop]);
    assert.equal(m.calls.inserts, 1);
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
