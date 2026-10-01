import assert from "node:assert/strict";
import { EVENT_CATEGORY_VALUES } from "@blue-beacon-research/shared";
import {
  EVENT_CATEGORY_CHIP_LABELS,
  EVENT_CATEGORY_CHIP_OPTIONS,
  UNCATEGORIZED_LABEL,
  eventCategoryChipLabel,
} from "./event-category-labels";

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

runTest("every EventCategory value has a chip label under 28 characters", () => {
  for (const value of EVENT_CATEGORY_VALUES) {
    const label = EVENT_CATEGORY_CHIP_LABELS[value];
    assert.ok(label && label.length > 0, `${value} missing a label`);
    assert.ok(label.length < 28, `${value} label "${label}" is ${label.length} chars, >= 28`);
  }
});

runTest("Uncategorized label is present and under 28 characters", () => {
  assert.equal(UNCATEGORIZED_LABEL, "Uncategorized");
  assert.ok(UNCATEGORIZED_LABEL.length < 28);
});

runTest("chip options list = 9 categories + uncategorized, no duplicates", () => {
  assert.equal(EVENT_CATEGORY_CHIP_OPTIONS.length, 10);
  const values = EVENT_CATEGORY_CHIP_OPTIONS.map((o) => o.value);
  assert.equal(new Set(values).size, 10);
  assert.ok(values.includes("uncategorized"));
});

runTest("eventCategoryChipLabel maps null to All", () => {
  assert.equal(eventCategoryChipLabel(null), "All");
});

runTest("eventCategoryChipLabel maps uncategorized to Uncategorized", () => {
  assert.equal(eventCategoryChipLabel("uncategorized"), "Uncategorized");
});
