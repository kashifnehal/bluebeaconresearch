import assert from "node:assert/strict";
import {
  applyRegionBackfillBatch,
  type RegionBackfillPatch,
  type RegionBackfillRow,
} from "./backfill-signal-region.js";

function runTest(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
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

runTest("batch updates only differing rows and writes region_raw once", async () => {
  const writes: Array<{ id: string; patch: RegionBackfillPatch }> = [];
  const client = {
    async update(id: string, patch: RegionBackfillPatch) {
      writes.push({ id, patch });
    },
  };
  const rows: RegionBackfillRow[] = [
    { id: "change", region: "Middle East", country: null, region_raw: null },
    { id: "same", region: "middle-east", country: null, region_raw: null },
    { id: "already-raw", region: "middle-east", country: "Iran", region_raw: "middle-east" },
    { id: "legacy-keep", region: "americas", country: null, region_raw: null },
    { id: "legacy-south", region: "americas", country: "Brazil", region_raw: "americas" },
  ];

  const result = await applyRegionBackfillBatch(client, rows, { apply: true });
  assert.equal(result.updated, 4);
  assert.deepStrictEqual(
    writes.map((write) => write.id),
    ["change", "same", "legacy-keep", "legacy-south"],
  );

  const byId = Object.fromEntries(writes.map((write) => [write.id, write.patch]));
  assert.deepStrictEqual(byId.change, { region_raw: "Middle East", region: "middle-east" });
  assert.deepStrictEqual(byId.same, { region_raw: "middle-east" });
  assert.equal(byId["already-raw"], undefined);
  assert.deepStrictEqual(byId["legacy-keep"], { region_raw: "americas" });
  assert.deepStrictEqual(byId["legacy-south"], { region: "south-america" });

  const second = await applyRegionBackfillBatch(
    client,
    [
      { id: "change", region: "middle-east", country: null, region_raw: "Middle East" },
      { id: "legacy-south", region: "south-america", country: "Brazil", region_raw: "americas" },
    ],
    { apply: true },
  );
  assert.equal(second.updated, 0);
  assert.equal(writes.length, 4);

  const dry = await applyRegionBackfillBatch(client, rows, { apply: false });
  assert.equal(dry.updated, 4);
  assert.equal(writes.length, 4);
});
