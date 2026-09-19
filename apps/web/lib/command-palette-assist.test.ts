import assert from "node:assert/strict";
import { shouldFetchSearchAssist } from "./command-palette-assist";

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

runTest("does not fire while the user is still typing (debounce mismatch)", () => {
  assert.equal(
    shouldFetchSearchAssist({
      open: true,
      trimmedQuery: "map",
      debouncedQuery: "ma",
      deterministicCount: 0,
      signalsFetching: false,
    }),
    false,
  );
});

runTest("does not fire while the signals search is in flight", () => {
  assert.equal(
    shouldFetchSearchAssist({
      open: true,
      trimmedQuery: "map",
      debouncedQuery: "map",
      deterministicCount: 0,
      signalsFetching: true,
    }),
    false,
  );
});

runTest("does not fire when existing search already has 2+ results", () => {
  assert.equal(
    shouldFetchSearchAssist({
      open: true,
      trimmedQuery: "oil",
      debouncedQuery: "oil",
      deterministicCount: 2,
      signalsFetching: false,
    }),
    false,
  );
});

runTest("fires when settled with 0 or 1 deterministic hits", () => {
  assert.equal(
    shouldFetchSearchAssist({
      open: true,
      trimmedQuery: "where is the calendar",
      debouncedQuery: "where is the calendar",
      deterministicCount: 0,
      signalsFetching: false,
    }),
    true,
  );
  assert.equal(
    shouldFetchSearchAssist({
      open: true,
      trimmedQuery: "telegram digest",
      debouncedQuery: "telegram digest",
      deterministicCount: 1,
      signalsFetching: false,
    }),
    true,
  );
});
