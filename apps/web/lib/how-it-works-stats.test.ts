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

runTest("TOTAL_COLLECTOR_COUNT is RSS feeds plus the other collector modules", () => {
  // 28 RSS feeds (packages/shared/src/constants/ingestion.ts) + 3 other
  // collectors (gdelt, gnews, acled) = 31.
  assert.equal(OTHER_COLLECTOR_COUNT, 3);
  assert.equal(TOTAL_COLLECTOR_COUNT, 28 + OTHER_COLLECTOR_COUNT);
});
