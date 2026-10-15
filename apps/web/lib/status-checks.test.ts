import assert from "node:assert/strict";

import {
  evaluateIntelligenceFeedHealth,
  evaluateClassifierHealth,
  evaluateDataPipelineFreshness,
  evaluatePriceHistoryHealth,
  runStatusCheckWithRetry,
} from "./status-checks";

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

const NOW = new Date("2026-10-01T12:00:00.000Z").getTime();
const CLOSED_CAP_COPY = /paused|budget|UTC day/i;

function assertNoClosedCapCopy(detail: string) {
  assert.doesNotMatch(detail, CLOSED_CAP_COPY);
}

runTest("healthy when an ingestion collector reported ok within the cutoff, even with no recent signal", () => {
  const result = evaluateIntelligenceFeedHealth(
    { service: "gdelt", created_at: new Date(NOW - 10 * 60 * 1000).toISOString() },
    new Date(NOW - 6 * 60 * 60 * 1000).toISOString(), // a quiet news hour, not an outage
    30,
    NOW,
  );
  assert.equal(result.status, "Operational");
  assert.match(result.detail, /gdelt collector last reported healthy/);
  assert.match(result.detail, /newest signal/);
});

runTest("degraded once the last ok health row is older than 2x the observed write interval", () => {
  const result = evaluateIntelligenceFeedHealth(
    { service: "rss", created_at: new Date(NOW - 61 * 60 * 1000).toISOString() },
    new Date(NOW - 5 * 60 * 1000).toISOString(),
    30,
    NOW,
  );
  assert.equal(result.status, "Degraded");
});

runTest("healthy right at the 60-minute cutoff boundary", () => {
  const result = evaluateIntelligenceFeedHealth(
    { service: "acled", created_at: new Date(NOW - 60 * 60 * 1000).toISOString() },
    null,
    30,
    NOW,
  );
  assert.equal(result.status, "Operational");
});

runTest("degraded with a clear detail string when no ingestion health rows exist at all", () => {
  const result = evaluateIntelligenceFeedHealth(null, null, 30, NOW);
  assert.equal(result.status, "Degraded");
  assert.match(result.detail, /No ingestion collector/);
  assert.match(result.detail, /gdelt\/gnews\/rss\/acled/);
});

runTest("newest-signal age is detail text only, never the pass/fail rule", () => {
  // A fresh signal but a stale collector health row must still fail — freshness is
  // decided by the health row, not the signal age.
  const staleCollectorFreshSignal = evaluateIntelligenceFeedHealth(
    { service: "gnews", created_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString() },
    new Date(NOW - 1 * 60 * 1000).toISOString(),
    30,
    NOW,
  );
  assert.equal(staleCollectorFreshSignal.status, "Degraded");
});

runTest("Intelligence Feed cutoff follows the real interval: interval 60 does not report Degraded at 61 minutes", () => {
  const result = evaluateIntelligenceFeedHealth(
    { service: "gdelt", created_at: new Date(NOW - 61 * 60 * 1000).toISOString() },
    null,
    60,
    NOW,
  );
  assert.notEqual(result.status, "Degraded");
});

runTest("Intelligence Feed cutoff follows the real interval: interval 30 reports Degraded at 61 minutes", () => {
  const result = evaluateIntelligenceFeedHealth(
    { service: "gdelt", created_at: new Date(NOW - 61 * 60 * 1000).toISOString() },
    null,
    30,
    NOW,
  );
  assert.equal(result.status, "Degraded");
});

runTest("Data Pipeline freshness: interval 60 does not report Degraded at 61 minutes", () => {
  const result = evaluateDataPipelineFreshness(new Date(NOW - 61 * 60 * 1000).toISOString(), 60, false, NOW);
  assert.notEqual(result.status, "Degraded");
});

runTest("Data Pipeline freshness: interval 30 reports Degraded at 61 minutes", () => {
  const result = evaluateDataPipelineFreshness(new Date(NOW - 61 * 60 * 1000).toISOString(), 30, false, NOW);
  assert.equal(result.status, "Degraded");
});

runTest("Classifier is Degraded when every signal in the window used the heuristic fallback", () => {
  const result = evaluateClassifierHealth([
    { classification_method: "heuristic" },
    { classification_method: "heuristic" },
  ]);
  assert.equal(result.status, "Degraded");
  assert.match(result.detail, /0 Claude, 2 keyword fallback \(only with no research-model client\)/);
  assert.doesNotMatch(result.detail, /otherwise/);
});

runTest("Classifier is Operational when at least one row used Claude", () => {
  const result = evaluateClassifierHealth([
    { classification_method: "heuristic" },
    { classification_method: "claude" },
  ]);
  assert.equal(result.status, "Operational");
});

runTest("Classifier is Operational when no signals were created, nothing to flag", () => {
  const result = evaluateClassifierHealth([]);
  assert.equal(result.status, "Operational");
});

runTest("Classifier is Unknown when the underlying query errors", () => {
  const result = evaluateClassifierHealth(null);
  assert.equal(result.status, "Unknown");
  assert.match(result.detail, /keyword fallback only when no research-model client is configured/);
  assert.match(result.detail, /collection pauses when the classifier cannot run/);
  assert.doesNotMatch(result.detail, /keyword fallback otherwise/);
});

runTest("a closed cap keeps Classifier, Data Pipeline, and Intelligence Feed Operational", () => {
  const signalAt = new Date(NOW - 5 * 60 * 1000).toISOString();
  const classifier = evaluateClassifierHealth(
    [{ classification_method: "heuristic" }, { classification_method: "heuristic" }],
    true,
  );
  const pipeline = evaluateDataPipelineFreshness(new Date(NOW - 3 * 60 * 60 * 1000).toISOString(), 30, true, NOW, true);
  const feed = evaluateIntelligenceFeedHealth(
    { service: "rss", created_at: new Date(NOW - 3 * 60 * 60 * 1000).toISOString() },
    signalAt,
    30,
    NOW,
    true,
  );
  const openClassifier = evaluateClassifierHealth(
    [{ classification_method: "heuristic" }, { classification_method: "heuristic" }],
    false,
  );

  assert.equal(classifier.status, "Operational");
  assert.equal(classifier.detail, openClassifier.detail);
  assert.equal(pipeline.status, "Operational");
  assert.equal(
    pipeline.detail,
    "Most recent ingested event, across all collectors combined, is less than 60 minutes old",
  );
  assert.equal(feed.status, "Operational");
  assert.equal(feed.detail, "Newest signal 5 min ago.");
  for (const check of [classifier, pipeline, feed]) assertNoClosedCapCopy(check.detail);
});

runTest("Classifier with a closed cap and a failed query uses the empty healthy count line", () => {
  const result = evaluateClassifierHealth(null, true);
  const healthyEmpty = evaluateClassifierHealth([], false);
  assert.equal(result.status, "Operational");
  assert.equal(result.detail, healthyEmpty.detail);
  assertNoClosedCapCopy(result.detail);
});

runTest("Classifier ignores budgetClosed=false and falls back to normal row-derived detail", () => {
  const result = evaluateClassifierHealth([{ classification_method: "claude" }], false);
  const baseline = evaluateClassifierHealth([{ classification_method: "claude" }]);
  assert.deepEqual(result, baseline);
  assert.equal(result.status, "Operational");
});

runTest("Data Pipeline budgetClosed=false leaves the existing freshness result", () => {
  const lastFetchedAt = new Date(NOW - 61 * 60 * 1000).toISOString();
  const withFlag = evaluateDataPipelineFreshness(lastFetchedAt, 30, false, NOW, false);
  const withoutFlag = evaluateDataPipelineFreshness(lastFetchedAt, 30, false, NOW);
  assert.deepEqual(withFlag, withoutFlag);
  assert.equal(withFlag.status, "Degraded");
  assert.equal(
    withFlag.detail,
    "Most recent ingested event, across all collectors combined, is less than 60 minutes old",
  );
  assertNoClosedCapCopy(withFlag.detail);
});

runTest("Intelligence Feed stays Degraded for a stale collector when budgetClosed is false", () => {
  const result = evaluateIntelligenceFeedHealth(
    { service: "rss", created_at: new Date(NOW - 61 * 60 * 1000).toISOString() },
    new Date(NOW - 5 * 60 * 1000).toISOString(),
    30,
    NOW,
    false,
  );
  assert.equal(result.status, "Degraded");
  assert.match(result.detail, /rss collector last reported healthy/);
  assertNoClosedCapCopy(result.detail);
});

runTest("Intelligence Feed with a closed cap and no signal does not invent an age", () => {
  const result = evaluateIntelligenceFeedHealth(null, null, 30, NOW, true);
  assert.equal(result.status, "Operational");
  assert.equal(result.detail, "No signals recorded yet.");
  assertNoClosedCapCopy(result.detail);
});

runTest("Price History is Unknown when the freshness query could not run", () => {
  const result = evaluatePriceHistoryHealth(0, null);
  assert.equal(result.status, "Unknown");
  assert.equal(result.name, "Price History");
});

runTest("Price History is Operational with enough rows and a fresh newest row", () => {
  const result = evaluatePriceHistoryHealth(1550, 10);
  assert.equal(result.status, "Operational");
  assert.match(result.detail, /1550 rows in last 30d/);
});

runTest("Price History is Degraded when rows exist but the newest is stale", () => {
  const result = evaluatePriceHistoryHealth(1550, 46);
  assert.equal(result.status, "Degraded");
});

runTest("Price History is Degraded when fresh but row count is too low", () => {
  const result = evaluatePriceHistoryHealth(5, 10);
  assert.equal(result.status, "Degraded");
});

runTest("Price History boundary: exactly 100 rows and exactly 45 minutes is still Operational", () => {
  const result = evaluatePriceHistoryHealth(100, 45);
  assert.equal(result.status, "Operational");
});

async function runAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

void (async () => {
  await runAsync("a check that fails once and then succeeds returns the result of the second attempt", async () => {
    let calls = 0;
    const result = await runStatusCheckWithRetry(async () => {
      calls += 1;
      if (calls === 1) throw new Error("status check timed out");
      return { name: "Alert Delivery", status: "Operational", detail: "second attempt" };
    });
    assert.equal(calls, 2);
    assert.equal(result.status, "Operational");
    assert.equal(result.detail, "second attempt");
  });

  await runAsync("a check that fails twice returns Unknown", async () => {
    let calls = 0;
    const result = await runStatusCheckWithRetry(async () => {
      calls += 1;
      throw new Error("status check timed out");
    });
    assert.equal(calls, 2);
    assert.equal(result.status, "Unknown");
  });

  await runAsync("a Degraded result is not retried", async () => {
    let calls = 0;
    const result = await runStatusCheckWithRetry(async () => {
      calls += 1;
      return { name: "Classifier", status: "Degraded", detail: "paused" };
    });
    assert.equal(calls, 1);
    assert.equal(result.status, "Degraded");
    assert.equal(result.detail, "paused");
  });
})();
