import assert from "node:assert/strict";

import {
  EVENT_DETAIL_FETCH_TIMEOUT_MS,
  EVENT_DETAIL_SLOW_MESSAGE,
  eventDetailNotice,
} from "./event-detail-fetch";

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

runTest("the event fetch limit is 20000 ms", () => {
  assert.equal(EVENT_DETAIL_FETCH_TIMEOUT_MS, 20_000);
});

runTest("timeout and fetch_failed use the slow sentence", () => {
  const timeout = eventDetailNotice(new Error("timeout"), []);
  const failed = eventDetailNotice(new Error("fetch_failed"), []);
  assert.equal(timeout.failure, "timeout");
  assert.equal(failed.failure, "fetch_failed");
  assert.equal(timeout.message, EVENT_DETAIL_SLOW_MESSAGE);
  assert.equal(failed.message, EVENT_DETAIL_SLOW_MESSAGE);
  assert.equal(
    timeout.message,
    "This is taking longer than usual. The data service is slow right now.",
  );
  assert.equal(timeout.degradedLine, null);
});

runTest("not_found stays not_found with no slow sentence", () => {
  const notice = eventDetailNotice(new Error("not_found"), []);
  assert.equal(notice.failure, "not_found");
  assert.equal(notice.message, null);
});

runTest("a degraded response names the skipped sections and hides those empty blocks", () => {
  const notice = eventDetailNotice(null, ["historical", "related"]);
  assert.equal(notice.failure, null);
  assert.equal(notice.message, null);
  assert.equal(
    notice.degradedLine,
    "Some sections are still loading slowly: historical, related.",
  );
  assert.equal(notice.hideHistorical, true);
  assert.equal(notice.hideRelated, true);

  const pricesOnly = eventDetailNotice(null, ["price_at_signal"]);
  assert.equal(
    pricesOnly.degradedLine,
    "Some sections are still loading slowly: price_at_signal.",
  );
  assert.equal(pricesOnly.hideHistorical, false);
  assert.equal(pricesOnly.hideRelated, false);
});

runTest("no error and no degraded sections leaves the page alone", () => {
  const notice = eventDetailNotice(null, []);
  assert.equal(notice.failure, null);
  assert.equal(notice.message, null);
  assert.equal(notice.degradedLine, null);
  assert.equal(notice.hideHistorical, false);
  assert.equal(notice.hideRelated, false);
});
