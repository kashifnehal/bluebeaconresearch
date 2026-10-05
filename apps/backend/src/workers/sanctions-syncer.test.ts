import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

// W7-IO-FIX-v2 — runSanctionsSyncOnce() gained a 20h skip-if-recent guard and a
// fetched-row-count log. Every dependency (clock, XML fetch, Supabase upsert,
// health read/write) is injected via the `deps` param (see sanctions-syncer.ts's
// SanctionsSyncDeps) — same pattern as acled-collector.test.ts — so nothing here
// calls OFAC or Supabase for real.
const { runSanctionsSyncOnce, SANCTIONS_SYNC_SERVICE } = await import("./sanctions-syncer.js");

const HOUR = 60 * 60 * 1000;
const SAMPLE_XML = `<?xml version="1.0"?>
<sdnList>
  <sdnEntry><lastName>Doe</lastName><firstName>Jane</firstName></sdnEntry>
  <sdnEntry><lastName>Smith</lastName><firstName>John</firstName></sdnEntry>
</sdnList>`;

type HealthCall = { service: string; status: string; detail?: string };

function makeHarness(startMs = 1_800_000_000_000) {
  let nowMs = startMs;
  const health: HealthCall[] = [];
  const upserted: Array<Record<string, unknown>[]> = [];
  let lastSuccessAt: number | null = null;
  let xmlToReturn: () => Promise<string> = async () => SAMPLE_XML;

  const fakeSupabase: any = {
    from(table: string) {
      if (table !== "sanctions_entities") throw new Error(`unexpected table ${table}`);
      return {
        upsert(rows: Record<string, unknown>[]) {
          upserted.push(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  return {
    health,
    upserted,
    advance(ms: number) {
      nowMs += ms;
    },
    setXml(fn: () => Promise<string>) {
      xmlToReturn = fn;
    },
    deps() {
      return {
        now: () => nowMs,
        supabase: fakeSupabase,
        fetchSdnXml: () => xmlToReturn(),
        recordHealth: async (service: string, status: string, detail?: string) => {
          health.push({ service, status, detail });
          if (status === "ok") lastSuccessAt = nowMs;
        },
        getLastSuccessfulRunAt: async () => lastSuccessAt,
      };
    },
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

await runTest("no prior successful run: fetches, upserts, and records an ok health row", async () => {
  const h = makeHarness();
  const result = await runSanctionsSyncOnce(h.deps());
  assert.equal(result.ok, true);
  assert.equal(result.upserted, 2);
  assert.equal(result.skipped, undefined);
  assert.equal(h.upserted.length, 1);
  assert.equal(h.upserted[0].length, 2);
  assert.equal(h.health.length, 1);
  assert.equal(h.health[0].service, SANCTIONS_SYNC_SERVICE);
  assert.equal(h.health[0].status, "ok");
  assert.match(h.health[0].detail ?? "", /fetched 2, upserted 2/);
});

await runTest("a successful run less than 20h ago is skipped: no fetch, no upsert", async () => {
  const h = makeHarness();
  await runSanctionsSyncOnce(h.deps());
  h.advance(19 * HOUR);
  const result = await runSanctionsSyncOnce(h.deps());
  assert.equal(result.skipped, "recent_run");
  assert.equal(result.upserted, 0);
  assert.equal(h.upserted.length, 1, "second run must not upsert again");
  assert.equal(h.health.length, 1, "second run must not write another health row");
});

await runTest("a successful run exactly 20h+ ago runs again", async () => {
  const h = makeHarness();
  await runSanctionsSyncOnce(h.deps());
  h.advance(20 * HOUR);
  const result = await runSanctionsSyncOnce(h.deps());
  assert.equal(result.skipped, undefined);
  assert.equal(h.upserted.length, 2);
  assert.equal(h.health.length, 2);
});

await runTest("a fetch failure records an error health row and rethrows (no upsert)", async () => {
  const h = makeHarness();
  h.setXml(() => Promise.reject(new Error("OFAC fetch failed: HTTP 503")));
  await assert.rejects(() => runSanctionsSyncOnce(h.deps()), /HTTP 503/);
  assert.equal(h.upserted.length, 0);
  assert.equal(h.health.length, 1);
  assert.equal(h.health[0].status, "error");
  assert.match(h.health[0].detail ?? "", /HTTP 503/);
});

if (failed) process.exitCode = 1;
