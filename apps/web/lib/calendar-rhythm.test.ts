import assert from "node:assert/strict";
import { weeklyRhythm } from "./calendar-rhythm";

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

const DAY_ORDER = ["Tuesday", "Wednesday", "Thursday", "Friday"];

runTest("weeklyRhythm entries are in Tue/Wed/Thu/Fri order", () => {
  const rhythm = weeklyRhythm();
  let lastIndex = -1;
  for (const entry of rhythm) {
    const index = DAY_ORDER.indexOf(entry.day);
    assert.ok(index >= lastIndex, `${entry.day} (${entry.event}) is out of order`);
    lastIndex = index;
  }
});

runTest("every weeklyRhythm entry has at least one commodity", () => {
  const rhythm = weeklyRhythm();
  assert.ok(rhythm.length > 0);
  for (const entry of rhythm) {
    assert.ok(entry.commodities.length > 0, `${entry.event} has an empty commodity list`);
  }
});

runTest("only the EIA Weekly Petroleum entry gets a sourceUrl — it's the only one already in the JSON", () => {
  const rhythm = weeklyRhythm();
  const withLinks = rhythm.filter((e) => e.sourceUrl != null);
  assert.deepEqual(withLinks.map((e) => e.event), ["EIA Weekly Petroleum Status Report"]);
  for (const entry of rhythm) {
    if (entry.sourceUrl == null) continue;
    assert.match(entry.sourceUrl, /^https:\/\//);
  }
});

runTest("expected five recurring releases are all present", () => {
  const rhythm = weeklyRhythm();
  assert.deepEqual(
    rhythm.map((e) => e.event),
    [
      "API weekly oil inventory report",
      "EIA Weekly Petroleum Status Report",
      "EIA Weekly Natural Gas Storage Report",
      "CFTC Commitments of Traders",
      "Baker Hughes rig count",
    ],
  );
});
