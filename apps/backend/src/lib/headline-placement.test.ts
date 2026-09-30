import assert from "node:assert/strict";
import { detectHeadlinePlacement } from "./headline-placement.js";

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

runTest("trigger keyword in the headline resolves to 'headline', body text is irrelevant", () => {
  assert.equal(
    detectHeadlinePlacement(
      "Sanctions imposed on shipping firm",
      "The article body has nothing else to add here.",
    ),
    "headline",
  );
});

runTest("trigger keyword only in the body resolves to 'body'", () => {
  assert.equal(
    detectHeadlinePlacement(
      "Local council meeting runs long",
      "Officials also discussed new sanctions against a shipping firm.",
    ),
    "body",
  );
});

runTest("no trigger keyword anywhere resolves to 'none'", () => {
  assert.equal(
    detectHeadlinePlacement("Local council meeting runs long", "Nothing noteworthy happened."),
    "none",
  );
});

runTest("GDELT case: no body text at all — a headline hit still reads 'headline', not 'body'", () => {
  assert.equal(detectHeadlinePlacement("Military escalation reported near border", ""), "headline");
  assert.equal(detectHeadlinePlacement("Military escalation reported near border", null), "headline");
});

runTest("GDELT case: no body text and no headline hit resolves to 'none', never 'body'", () => {
  assert.equal(detectHeadlinePlacement("Local bakery wins award", ""), "none");
});

runTest("null/undefined title and body never throw", () => {
  assert.equal(detectHeadlinePlacement(null, null), "none");
  assert.equal(detectHeadlinePlacement(undefined, undefined), "none");
});
