import assert from "node:assert/strict";
import { searchWindowAgreement } from "./search-window";

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

runTest("the shown total uses the window that produced the rows", () => {
  const agreed = searchWindowAgreement(4, 11);
  assert.deepEqual(agreed, { total: 4, olderMatches: 7 });
});

runTest("no older matches when every hit is inside the window", () => {
  assert.deepEqual(searchWindowAgreement(4, 4), { total: 4, olderMatches: 0 });
});

runTest("a larger windowed count is not reported as negative older matches", () => {
  assert.deepEqual(searchWindowAgreement(5, 2), { total: 5, olderMatches: 0 });
});
