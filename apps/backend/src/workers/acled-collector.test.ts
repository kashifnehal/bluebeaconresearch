import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

// Imported after the env is set (getEnv() reads process.env lazily, but keep the
// order explicit). Nothing here calls ACLED, Anthropic or Supabase: the ACLED
// service and the health writer are injected fakes, and every case below either
// returns before ingest or fetches zero events.
const {
  runAcledCollectorOnce,
  resetAcledBackoffForTests,
  ACLED_ACCESS_DENIED_DETAIL,
} = await import("./acled-collector.js");
const { AcledAccessDeniedError } = await import("../services/acled.service.js");

type HealthCall = { service: string; status: string; detail?: string };

function makeHarness(startMs = 1_800_000_000_000) {
  let nowMs = startMs;
  const health: HealthCall[] = [];
  let fetchCalls = 0;
  let nextFetch: () => Promise<unknown[]> = async () => [];
  return {
    health,
    get fetchCalls() {
      return fetchCalls;
    },
    advance(ms: number) {
      nowMs += ms;
    },
    setFetch(fn: () => Promise<unknown[]>) {
      nextFetch = fn;
    },
    deps() {
      return {
        now: () => nowMs,
        acled: {
          fetchRecentEvents: async () => {
            fetchCalls += 1;
            return (await nextFetch()) as never;
          },
        },
        recordHealth: async (service: string, status: string, detail?: string) => {
          health.push({ service, status, detail });
        },
      };
    },
  };
}

const HOUR = 60 * 60 * 1000;
const denied = () =>
  Promise.reject(new AcledAccessDeniedError('ACLED read failed: HTTP 403 Forbidden | body: {"message":"Access denied"}'));

let failed = false;
async function runTest(name: string, fn: () => Promise<void>) {
  resetAcledBackoffForTests();
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

await runTest("first 403: one failure health row with the fixed wording, returns normally (no throw)", async () => {
  const h = makeHarness();
  h.setFetch(denied);
  const result = await runAcledCollectorOnce(h.deps());
  assert.equal(result.skipped, "access_denied");
  assert.equal(result.inserted, 0);
  assert.equal(h.fetchCalls, 1);
  assert.equal(h.health.length, 1);
  assert.deepEqual(h.health[0], {
    service: "acled",
    status: "error",
    detail: ACLED_ACCESS_DENIED_DETAIL,
  });
  assert.equal(
    ACLED_ACCESS_DENIED_DETAIL,
    "ACLED data access denied (HTTP 403). Awaiting licence or tier upgrade. Login works.",
  );
});

await runTest("second call inside 24h: no ACLED request and no new health row", async () => {
  const h = makeHarness();
  h.setFetch(denied);
  await runAcledCollectorOnce(h.deps());
  h.advance(23 * HOUR);
  const result = await runAcledCollectorOnce(h.deps());
  assert.equal(result.skipped, "access_denied_backoff");
  assert.equal(h.fetchCalls, 1, "ACLED must not be called inside the window");
  assert.equal(h.health.length, 1, "no new health row inside the window");
});

await runTest("after 24h: exactly one request is made", async () => {
  const h = makeHarness();
  h.setFetch(denied);
  await runAcledCollectorOnce(h.deps());
  h.advance(24 * HOUR);
  await runAcledCollectorOnce(h.deps());
  assert.equal(h.fetchCalls, 2);
});

await runTest("still 403 after 24h: back-off restarts and a second failure row is written", async () => {
  const h = makeHarness();
  h.setFetch(denied);
  await runAcledCollectorOnce(h.deps());
  h.advance(24 * HOUR);
  await runAcledCollectorOnce(h.deps());
  assert.equal(h.health.length, 2);
  // And the window restarted: the next call is skipped again.
  h.advance(HOUR);
  const result = await runAcledCollectorOnce(h.deps());
  assert.equal(result.skipped, "access_denied_backoff");
  assert.equal(h.fetchCalls, 2);
});

await runTest("a 200 after the window clears the flag: next cycle calls ACLED again", async () => {
  const h = makeHarness();
  h.setFetch(denied);
  await runAcledCollectorOnce(h.deps());
  h.advance(24 * HOUR);
  h.setFetch(async () => []); // access granted, zero events this week
  const ok = await runAcledCollectorOnce(h.deps());
  assert.equal(ok.skipped, undefined);
  assert.equal(h.health.at(-1)?.status, "ok");
  assert.equal(h.health.at(-1)?.detail, "fetched 0 event(s)");
  const callsBefore = h.fetchCalls;
  h.advance(30 * 60 * 1000); // next ingestion cycle
  await runAcledCollectorOnce(h.deps());
  assert.equal(h.fetchCalls, callsBefore + 1, "flag must be cleared, so ACLED is called every cycle again");
});

await runTest("non-403 error: health row with the message, and the error is rethrown", async () => {
  const h = makeHarness();
  h.setFetch(() => Promise.reject(new Error("ACLED read failed: HTTP 500 Internal Server Error")));
  await assert.rejects(() => runAcledCollectorOnce(h.deps()), /HTTP 500/);
  assert.equal(h.health.length, 1);
  assert.equal(h.health[0].status, "error");
  assert.match(h.health[0].detail ?? "", /HTTP 500/);
  // A non-403 failure must not start the back-off.
  h.advance(HOUR);
  await assert.rejects(() => runAcledCollectorOnce(h.deps()), /HTTP 500/);
  assert.equal(h.fetchCalls, 2);
});

await runTest("login failure: not treated as access denied (health row and rethrow)", async () => {
  const h = makeHarness();
  h.setFetch(() => Promise.reject(new Error("ACLED login failed: HTTP 401 Unauthorized")));
  await assert.rejects(() => runAcledCollectorOnce(h.deps()), /login failed/);
  assert.equal(h.health.length, 1);
});

await runTest("credentials missing: no health row, error rethrown (workers.ts logs it at debug level)", async () => {
  const h = makeHarness();
  h.setFetch(() => Promise.reject(new Error("ACLED credentials missing in .env")));
  await assert.rejects(() => runAcledCollectorOnce(h.deps()), /credentials missing/);
  assert.equal(h.health.length, 0);
});

if (failed) process.exitCode = 1;
