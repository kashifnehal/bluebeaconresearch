import assert from "node:assert/strict";

import {
  formatStatNumber,
  OTHER_COLLECTOR_COUNT,
  TOTAL_COLLECTOR_COUNT,
} from "./how-it-works-stats";

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

runTest("formatStatNumber adds thousands separators", () => {
  assert.equal(formatStatNumber(2996), "2,996");
  assert.equal(formatStatNumber(44), "44");
  assert.equal(formatStatNumber(0), "0");
});

runTest("TOTAL_COLLECTOR_COUNT is RSS feeds plus the collectors that actually ingest", () => {
  // 28 RSS feeds (packages/shared/src/constants/ingestion.ts) + 2 other collectors
  // that ingest today (gdelt, gnews) = 30. ACLED is excluded while it ingests
  // nothing (HTTP 403 on the data read); add it back when acled raw events exist.
  assert.equal(OTHER_COLLECTOR_COUNT, 2);
  assert.equal(TOTAL_COLLECTOR_COUNT, 28 + OTHER_COLLECTOR_COUNT);
  assert.equal(TOTAL_COLLECTOR_COUNT, 30);
});
