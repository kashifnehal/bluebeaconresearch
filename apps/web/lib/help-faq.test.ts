import assert from "node:assert/strict";
import { HELP_FAQ_ITEMS } from "./help-faq";

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

runTest("FAQ has 10 honest product questions", () => {
  assert.equal(HELP_FAQ_ITEMS.length, 10);
  const ids = HELP_FAQ_ITEMS.map((i) => i.id);
  for (const id of [
    "confidence",
    "accuracy-history",
    "live",
    "materiality",
    "not-advice",
    "accuracy-method",
    "research-chat",
    "calendar",
    "severity",
    "human-review",
  ]) {
    assert.equal(ids.includes(id), true, `missing ${id}`);
  }
});

runTest("confidence, severity, and human review describe pause-instead-of-guessing", () => {
  const byId = Object.fromEntries(HELP_FAQ_ITEMS.map((item) => [item.id, item.answer]));
  for (const id of ["confidence", "severity", "human-review"] as const) {
    const answer = byId[id];
    assert.equal(answer.includes("only when no research-model client is configured"), true, id);
    assert.equal(
      answer.includes(
        "When the classifier cannot run because the daily cap is closed or because of a temporary error, collection pauses and no signal is created from a keyword guess.",
      ),
      true,
      id,
    );
    assert.equal(/unavailable, a keyword fallback/.test(answer), false, id);
    assert.equal(/otherwise a conservative keyword fallback/.test(answer), false, id);
  }
});

runTest("no FAQ answer claims buy/sell or human verification", () => {
  const blob = HELP_FAQ_ITEMS.map((i) => `${i.question} ${i.answer}`).join("\n").toLowerCase();
  assert.equal(blob.includes("buy or sell"), true);
  assert.equal(/human[- ]verified/.test(blob), true);
  assert.equal(blob.includes("not financial advice"), true);
  assert.equal(blob.includes("tsc/basic"), true);
  assert.equal(blob.includes("min 20"), true);
});
