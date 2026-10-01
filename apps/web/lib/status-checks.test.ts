import assert from "node:assert/strict";

import { evaluateIntelligenceFeedHealth } from "./status-checks";

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
    NOW,
  );
  assert.equal(result.status, "Degraded");
});

runTest("healthy right at the 60-minute cutoff boundary", () => {
  const result = evaluateIntelligenceFeedHealth(
    { service: "acled", created_at: new Date(NOW - 60 * 60 * 1000).toISOString() },
    null,
    NOW,
  );
  assert.equal(result.status, "Operational");
});

runTest("degraded with a clear detail string when no ingestion health rows exist at all", () => {
  const result = evaluateIntelligenceFeedHealth(null, null, NOW);
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
    NOW,
  );
  assert.equal(staleCollectorFreshSignal.status, "Degraded");
});
