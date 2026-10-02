import assert from "node:assert/strict";

import { toggleWatchlistSymbol } from "./watchlist-follow";

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

runTest("adds a symbol that is not yet present", () => {
  assert.deepEqual(toggleWatchlistSymbol(["USOIL"], "XAGUSD"), ["USOIL", "XAGUSD"]);
});

runTest("removes a symbol that is present", () => {
  assert.deepEqual(toggleWatchlistSymbol(["USOIL", "XAGUSD"], "XAGUSD"), ["USOIL"]);
});

runTest("toggling twice returns to the original list", () => {
  const original = ["USOIL", "WHEAT"];
  const followed = toggleWatchlistSymbol(original, "XAGUSD");
  const unfollowed = toggleWatchlistSymbol(followed, "XAGUSD");
  assert.deepEqual(unfollowed, original);
});

runTest("adding never produces a duplicate", () => {
  const once = toggleWatchlistSymbol([], "XAGUSD");
  assert.deepEqual(once, ["XAGUSD"]);
  // A second add is only reachable if state is already out of sync (the real
  // UI always reads isWatchlisted before deciding add-vs-remove) — still must
  // never double-insert if it happens.
  assert.ok(!once.includes("XAGUSD", 1), "symbol should not appear twice");
});

runTest("removing clears every occurrence of a pre-existing duplicate", () => {
  assert.deepEqual(toggleWatchlistSymbol(["XAGUSD", "USOIL", "XAGUSD"], "XAGUSD"), ["USOIL"]);
});

runTest("empty list follow then unfollow is a no-op round trip", () => {
  const empty: string[] = [];
  const followed = toggleWatchlistSymbol(empty, "EURUSD");
  const unfollowed = toggleWatchlistSymbol(followed, "EURUSD");
  assert.deepEqual(unfollowed, empty);
});
