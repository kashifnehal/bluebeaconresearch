import assert from "node:assert/strict";
import { regionMatches } from "./region-variants.js";

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

runTest("old label rule ('Middle East') matches new label signal ('middle-east')", () => {
  assert.equal(regionMatches(["Middle East"], "middle-east"), true);
});

runTest("new label rule ('middle-east') matches old label signal ('Middle East')", () => {
  assert.equal(regionMatches(["middle-east"], "Middle East"), true);
});

runTest("unknown label with no known variant falls back to exact match", () => {
  assert.equal(regionMatches(["middle-east"], "Middle East - Iran"), false);
  assert.equal(regionMatches(["Caribbean/Americas"], "Caribbean/Americas"), true);
});

runTest("empty rule regions never match", () => {
  assert.equal(regionMatches([], "middle-east"), false);
});

runTest("empty/falsy signal region never matches", () => {
  assert.equal(regionMatches(["middle-east"], ""), false);
});

runTest("no overlap across different regions does not match", () => {
  assert.equal(regionMatches(["africa"], "middle-east"), false);
});
