import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-role-key";

const {
  shouldDispatchAlertsForRecovered,
  dispatchAlertsForRecoveredIfFresh,
} = await import("./reconciliation.js");

let failed = false;
function runTest(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      failed = true;
      console.error(`✖ ${name}`);
      console.error(err);
    });
}

const now = new Date("2026-10-14T12:00:00.000Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const createdAt = hoursAgo(1);

await runTest("2h old event_date -> true", () => {
  assert.equal(shouldDispatchAlertsForRecovered(hoursAgo(2), createdAt, now), true);
});

await runTest("23h 59min old event_date -> true", () => {
  const eventDate = new Date(now.getTime() - (24 * 3_600_000 - 60_000)).toISOString();
  assert.equal(shouldDispatchAlertsForRecovered(eventDate, createdAt, now), true);
});

await runTest("25h old event_date -> false", () => {
  assert.equal(shouldDispatchAlertsForRecovered(hoursAgo(25), createdAt, now), false);
});

await runTest("null eventDate falls back to created_at", () => {
  assert.equal(shouldDispatchAlertsForRecovered(null, hoursAgo(2), now), true);
  assert.equal(shouldDispatchAlertsForRecovered(undefined, hoursAgo(2), now), true);
  assert.equal(shouldDispatchAlertsForRecovered(null, hoursAgo(25), now), false);
});

await runTest("invalid date string -> false", () => {
  assert.equal(shouldDispatchAlertsForRecovered("not-a-date", createdAt, now), false);
  assert.equal(shouldDispatchAlertsForRecovered(null, "also-not-a-date", now), false);
});

await runTest("loop: dispatch is skipped for an old row and called for a fresh one", async () => {
  const dispatched: string[] = [];
  const fakeDispatch = async (id: string) => {
    dispatched.push(id);
    return { sent: 1 };
  };

  const rows = [
    { id: "old-sig", eventDate: hoursAgo(25), rawCreatedAt: hoursAgo(25) },
    { id: "fresh-sig", eventDate: hoursAgo(2), rawCreatedAt: hoursAgo(2) },
  ];

  let alertsSkippedOld = 0;
  for (const row of rows) {
    const dispatchedThis = await dispatchAlertsForRecoveredIfFresh(
      row.id,
      row.eventDate,
      row.rawCreatedAt,
      now,
      fakeDispatch,
    );
    if (!dispatchedThis) alertsSkippedOld += 1;
  }

  assert.deepEqual(dispatched, ["fresh-sig"]);
  assert.equal(alertsSkippedOld, 1);
});

if (failed) {
  console.error("\nSome reconciliation-guard tests failed.");
  process.exit(1);
}
console.log("\nAll reconciliation-guard tests passed.");
