import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-supabase-role-key";

// Pure functions only. shouldStopBatch does not touch the network.
// decideRawEventClassification is the reconciliation/ACLED per-event decision;
// importing it loads those modules but this file never calls classifyEvent,
// Supabase, or Anthropic.
const { shouldStopBatch } = await import("../services/claude.service.js");
const { decideRawEventClassification } = await import("./reconciliation.js");

let failed = false;
function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

runTest("shouldStopBatch stops for budget_closed and spend_limit", () => {
  assert.equal(shouldStopBatch("budget_closed"), true);
  assert.equal(shouldStopBatch("budget_closed", 400), true);
  assert.equal(shouldStopBatch("spend_limit"), true);
  assert.equal(shouldStopBatch("spend_limit", 400), true);
});

runTest("shouldStopBatch stops for service-level api_error and skips request-specific errors", () => {
  assert.equal(shouldStopBatch("api_error"), true, "network error has no HTTP status");
  for (const status of [401, 403, 429, 500, 502, 503, 529]) {
    assert.equal(shouldStopBatch("api_error", status), true, `status ${status} is service-level`);
  }
  for (const status of [400, 404, 413]) {
    assert.equal(shouldStopBatch("api_error", status), false, `status ${status} is request-specific`);
  }
});

runTest("shouldStopBatch skips json_parse and an unknown reason", () => {
  assert.equal(shouldStopBatch("json_parse"), false);
  assert.equal(shouldStopBatch("json_parse", 500), false);
  assert.equal(shouldStopBatch(undefined), false);
});

runTest("a deferred result leaves materiality_checked_at unset and creates no signal", () => {
  const deferredCases = [
    { deferReason: "budget_closed" as const, action: "stop_batch" as const },
    { deferReason: "spend_limit" as const, action: "stop_batch" as const },
    { deferReason: "api_error" as const, deferHttpStatus: 500, action: "stop_batch" as const },
    { deferReason: "api_error" as const, deferHttpStatus: undefined, action: "stop_batch" as const },
    { deferReason: "json_parse" as const, action: "skip_event" as const },
    { deferReason: "api_error" as const, deferHttpStatus: 400, action: "skip_event" as const },
    { deferReason: "api_error" as const, deferHttpStatus: 404, action: "skip_event" as const },
    { deferReason: "api_error" as const, deferHttpStatus: 413, action: "skip_event" as const },
  ];
  for (const sample of deferredCases) {
    const decision = decideRawEventClassification({
      deferred: true,
      deferReason: sample.deferReason,
      deferHttpStatus: sample.deferHttpStatus,
      // The deferred placeholder sets materialityPass false. That must not
      // become a rejection stamp.
      materialityPass: false,
    });
    assert.equal(decision.action, sample.action, sample.deferReason);
    assert.equal(decision.createSignal, false, sample.deferReason);
    assert.equal(decision.setMaterialityCheckedAt, false, sample.deferReason);
  }
});

runTest("a real materiality rejection stamps materiality_checked_at and a pass inserts", () => {
  const rejected = decideRawEventClassification({ deferred: false, materialityPass: false });
  assert.equal(rejected.action, "reject");
  assert.equal(rejected.createSignal, false);
  assert.equal(rejected.setMaterialityCheckedAt, true);

  const inserted = decideRawEventClassification({ materialityPass: true });
  assert.equal(inserted.action, "insert");
  assert.equal(inserted.createSignal, true);
  assert.equal(inserted.setMaterialityCheckedAt, false);
});

if (failed) process.exitCode = 1;
