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
type RpcResult = { data: number | null; error: { code?: string; message: string } | null };

function makeHarness(startMs = 1_800_000_000_000) {
  let nowMs = startMs;
  const health: HealthCall[] = [];
  const upserted: Array<Record<string, unknown>[]> = [];
  const rpcCalls: Array<Record<string, unknown>[]> = [];
  let lastSuccessAt: number | null = null;
  let xmlToReturn: () => Promise<string> = async () => SAMPLE_XML;
  let rpcHandler: (rows: Record<string, unknown>[], callIndex: number) => RpcResult = (rows) => ({
    data: rows.length,
    error: null,
  });

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
    rpc(name: string, args: { p_rows: Record<string, unknown>[] }) {
      if (name !== "upsert_sanctions_entities") throw new Error(`unexpected rpc ${name}`);
      const callIndex = rpcCalls.length;
      rpcCalls.push(args.p_rows);
      return Promise.resolve(rpcHandler(args.p_rows, callIndex));
    },
  };

  return {
    health,
    upserted,
    rpcCalls,
    setRpc(fn: (rows: Record<string, unknown>[], callIndex: number) => RpcResult) {
      rpcHandler = fn;
    },
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

await runTest("no prior successful run: fetches, calls rpc once, and records changed", async () => {
  const h = makeHarness();
  const result = await runSanctionsSyncOnce(h.deps());
  assert.equal(result.ok, true);
  assert.equal(result.changed, 2);
  assert.equal(result.upserted, 2);
  assert.equal(result.skipped, undefined);
  assert.equal(h.rpcCalls.length, 1);
  assert.equal(h.rpcCalls[0].length, 2);
  assert.equal(h.upserted.length, 0);
  assert.equal(h.health.length, 1);
  assert.equal(h.health[0].service, SANCTIONS_SYNC_SERVICE);
  assert.equal(h.health[0].status, "ok");
  assert.match(h.health[0].detail ?? "", /fetched 2, changed 2/);
});

await runTest("a successful run less than 20h ago is skipped: no fetch, no upsert", async () => {
  const h = makeHarness();
  await runSanctionsSyncOnce(h.deps());
  h.advance(19 * HOUR);
  const result = await runSanctionsSyncOnce(h.deps());
  assert.equal(result.skipped, "recent_run");
  assert.equal(result.upserted, 0);
  assert.equal(h.rpcCalls.length, 1, "second run must not call rpc again");
  assert.equal(h.upserted.length, 0, "second run must not upsert");
  assert.equal(h.health.length, 1, "second run must not write another health row");
});

await runTest("a successful run exactly 20h+ ago runs again", async () => {
  const h = makeHarness();
  await runSanctionsSyncOnce(h.deps());
  h.advance(20 * HOUR);
  const result = await runSanctionsSyncOnce(h.deps());
  assert.equal(result.skipped, undefined);
  assert.equal(h.rpcCalls.length, 2);
  assert.equal(h.health.length, 2);
});

await runTest("a fetch failure records an error health row and rethrows (no upsert)", async () => {
  const h = makeHarness();
  h.setXml(() => Promise.reject(new Error("OFAC fetch failed: HTTP 503")));
  await assert.rejects(() => runSanctionsSyncOnce(h.deps()), /HTTP 503/);
  assert.equal(h.rpcCalls.length, 0);
  assert.equal(h.upserted.length, 0);
  assert.equal(h.health.length, 1);
  assert.equal(h.health[0].status, "error");
  assert.match(h.health[0].detail ?? "", /HTTP 503/);
});

function xmlWithEntries(count: number): string {
  const entries = Array.from({ length: count }, (_, i) => `<sdnEntry><lastName>Name${i}</lastName></sdnEntry>`).join("");
  return `<?xml version="1.0"?><sdnList>${entries}</sdnList>`;
}

await runTest("rpc is called once per chunk and the changed counts are summed", async () => {
  const h = makeHarness();
  h.setXml(async () => xmlWithEntries(501));
  h.setRpc((rows, callIndex) => ({ data: callIndex === 0 ? 3 : 1, error: null }));
  const result = await runSanctionsSyncOnce(h.deps());
  assert.equal(h.rpcCalls.length, 2);
  assert.equal(h.rpcCalls[0].length, 500);
  assert.equal(h.rpcCalls[1].length, 1);
  assert.equal(result.changed, 4);
  assert.match(h.health[0].detail ?? "", /fetched 501, changed 4/);
  assert.equal(h.upserted.length, 0);
});

await runTest("PGRST202 falls back to row upsert for the rest of the run", async () => {
  const h = makeHarness();
  h.setXml(async () => xmlWithEntries(501));
  h.setRpc(() => ({ data: null, error: { code: "PGRST202", message: "function not found" } }));
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const result = await runSanctionsSyncOnce(h.deps());
    assert.equal(result.changed, 501);
    assert.equal(h.rpcCalls.length, 1);
    assert.equal(h.upserted.length, 2);
    assert.equal(h.upserted[0].length, 500);
    assert.equal(h.upserted[1].length, 1);
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? "", /PGRST202/);
    assert.match(h.health[0].detail ?? "", /fetched 501, changed 501/);
  } finally {
    console.error = orig;
  }
});

await runTest("an rpc error on one chunk is logged and the run continues", async () => {
  const h = makeHarness();
  h.setXml(async () => xmlWithEntries(501));
  h.setRpc((_rows, callIndex) =>
    callIndex === 0
      ? { data: null, error: { code: "57014", message: "chunk timed out" } }
      : { data: 1, error: null },
  );
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const result = await runSanctionsSyncOnce(h.deps());
    assert.equal(result.ok, true);
    assert.equal(result.changed, 1);
    assert.equal(h.rpcCalls.length, 2);
    assert.equal(h.upserted.length, 0);
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? "", /chunk timed out/);
    assert.equal(h.health.length, 1);
    assert.equal(h.health[0].status, "ok");
    assert.match(h.health[0].detail ?? "", /fetched 501, changed 1/);
  } finally {
    console.error = orig;
  }
});

if (failed) process.exitCode = 1;
