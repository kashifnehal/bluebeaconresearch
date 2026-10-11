import assert from "node:assert/strict";

import {
  evaluateIntelligenceFeedHealth,
  evaluateClassifierHealth,
  evaluateDataPipelineFreshness,
  evaluatePriceHistoryHealth,
  BUDGET_CLOSED_DETAIL,
  DATA_PIPELINE_BUDGET_CLOSED_DETAIL,
  INTELLIGENCE_FEED_BUDGET_PAUSED_SUFFIX,
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

runTest("Classifier shows the budget-closed line, not row counts, when budgetClosed is true", () => {
  const result = evaluateClassifierHealth(
    [{ classification_method: "heuristic" }, { classification_method: "heuristic" }],
    true,
  );
  assert.equal(result.status, "Degraded");
  assert.equal(result.detail, BUDGET_CLOSED_DETAIL);
});

runTest("Classifier budget-closed line does not claim a reopen time or a dollar amount", () => {
  const result = evaluateClassifierHealth([], true);
  assert.match(result.detail, /next UTC day/);
  assert.doesNotMatch(result.detail, /\$/);
});

runTest("Classifier budget-closed overrides even an Unknown (query-error) row state", () => {
  const result = evaluateClassifierHealth(null, true);
  assert.equal(result.status, "Degraded");
  assert.equal(result.detail, BUDGET_CLOSED_DETAIL);
});

runTest("Classifier ignores budgetClosed=false and falls back to normal row-derived detail", () => {
  const result = evaluateClassifierHealth([{ classification_method: "claude" }], false);
  assert.equal(result.status, "Operational");
  assert.notEqual(result.detail, BUDGET_CLOSED_DETAIL);
});

runTest("Data Pipeline is Degraded with the paused line when budgetClosed is true", () => {
  // Fresh enough to be Operational if the budget were open — the flag overrides freshness.
  const result = evaluateDataPipelineFreshness(new Date(NOW - 5 * 60 * 1000).toISOString(), 30, false, NOW, true);
  assert.equal(result.name, "Data Pipeline");
  assert.equal(result.status, "Degraded");
  assert.equal(result.detail, DATA_PIPELINE_BUDGET_CLOSED_DETAIL);
  assert.equal(
    result.detail,
    "Paused: the daily classification budget is reached. No new news is collected until the next UTC day.",
  );
  assert.doesNotMatch(result.detail, /\$/);
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
  assert.doesNotMatch(withFlag.detail, /Collection is paused/);
  assert.notEqual(withFlag.detail, DATA_PIPELINE_BUDGET_CLOSED_DETAIL);
});

runTest("Intelligence Feed appends the paused suffix only when budgetClosed is true", () => {
  const row = { service: "gdelt", created_at: new Date(NOW - 10 * 60 * 1000).toISOString() };
  const open = evaluateIntelligenceFeedHealth(row, null, 30, NOW, false);
  const baseline = evaluateIntelligenceFeedHealth(row, null, 30, NOW);
  const closed = evaluateIntelligenceFeedHealth(row, null, 30, NOW, true);
  assert.deepEqual(open, baseline);
  assert.equal(open.status, "Operational");
  assert.doesNotMatch(open.detail, /Collection is paused/);
  assert.equal(closed.status, open.status);
  assert.equal(closed.detail, `${open.detail}${INTELLIGENCE_FEED_BUDGET_PAUSED_SUFFIX}`);
  assert.equal(closed.detail.endsWith(" Collection is paused until the next UTC day."), true);

  const degradedOpen = evaluateIntelligenceFeedHealth(null, null, 30, NOW, false);
  const degradedClosed = evaluateIntelligenceFeedHealth(null, null, 30, NOW, true);
  assert.equal(degradedClosed.status, degradedOpen.status);
  assert.equal(degradedClosed.status, "Degraded");
  assert.equal(degradedClosed.detail, `${degradedOpen.detail}${INTELLIGENCE_FEED_BUDGET_PAUSED_SUFFIX}`);
  assert.doesNotMatch(degradedOpen.detail, /Collection is paused/);
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
