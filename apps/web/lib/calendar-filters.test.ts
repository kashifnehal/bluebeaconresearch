import assert from "node:assert/strict";
import { visibleValueColumns } from "./calendar-filters";

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

runTest("visibleValueColumns hides every column when all events are null", () => {
  const events = [
    { forecast: null, previous: null, actual: null },
    { forecast: null, previous: null, actual: null },
  ];
  assert.deepEqual(visibleValueColumns(events), { forecast: false, previous: false, actual: false });
});

runTest("visibleValueColumns shows a column when at least one event has a value", () => {
  const events = [
    { forecast: "2.1%", previous: null, actual: null },
    { forecast: null, previous: null, actual: null },
  ];
  assert.deepEqual(visibleValueColumns(events), { forecast: true, previous: false, actual: false });
});

runTest("visibleValueColumns is independent per column with a mixed dataset", () => {
  const events = [
    { forecast: "2.1%", previous: null, actual: "1.9%" },
    { forecast: null, previous: "0.4%", actual: null },
  ];
  assert.deepEqual(visibleValueColumns(events), { forecast: true, previous: true, actual: true });
});

runTest("visibleValueColumns on an empty event list hides everything", () => {
  assert.deepEqual(visibleValueColumns([]), { forecast: false, previous: false, actual: false });
});
