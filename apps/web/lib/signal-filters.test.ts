import assert from "node:assert/strict";
import { EVENT_CATEGORY_VALUES } from "@blue-beacon-research/shared";
import { DEFAULT_FILTERS, eventCategoryQueryParam } from "./signal-filters";

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

runTest("eventCategoryQueryParam(null) omits the param entirely", () => {
  assert.equal(eventCategoryQueryParam(null), "");
});

runTest("eventCategoryQueryParam(category) builds eventCategory=<value>", () => {
  assert.equal(
    eventCategoryQueryParam("armed_conflict_security"),
    "eventCategory=armed_conflict_security",
  );
});

runTest('eventCategoryQueryParam("uncategorized") builds eventCategory=uncategorized', () => {
  assert.equal(eventCategoryQueryParam("uncategorized"), "eventCategory=uncategorized");
});

runTest("DEFAULT_FILTERS.eventCategory defaults to null (All)", () => {
  assert.equal(DEFAULT_FILTERS.eventCategory, null);
});

runTest("EVENT_CATEGORY_VALUES has exactly 9 entries with no duplicates", () => {
  assert.equal(EVENT_CATEGORY_VALUES.length, 9);
  assert.equal(new Set(EVENT_CATEGORY_VALUES).size, 9);
});
