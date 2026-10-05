import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

// selectGnewsQuery is pure (cycleIndex in, {query, index} out) — no network/Supabase
// involved, so this only exercises the rotation math introduced by W7-GNEWS-ROTATE.
const { selectGnewsQuery } = await import("./gnews-collector.js");

let failed = false;
function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

runTest("cycles through 4 distinct queries before repeating", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const { query, index } = selectGnewsQuery(i);
    assert.equal(index, i);
    seen.add(query);
  }
  assert.equal(seen.size, 4, "all 4 queries must be distinct");
  assert.deepEqual(selectGnewsQuery(4), selectGnewsQuery(0), "index 4 wraps back to index 0");
});

runTest("wraps around with modulo past one full rotation", () => {
  assert.deepEqual(selectGnewsQuery(5), selectGnewsQuery(1));
  assert.deepEqual(selectGnewsQuery(8), selectGnewsQuery(0));
  assert.deepEqual(selectGnewsQuery(97), selectGnewsQuery(1)); // 97 % 4 === 1
});

runTest("negative cycleIndex still resolves to a valid, non-negative query index", () => {
  const { index } = selectGnewsQuery(-1);
  assert.equal(index, 3);
  assert.deepEqual(selectGnewsQuery(-1), selectGnewsQuery(3));
});

runTest("index always stays within the 4-query bounds regardless of cycleIndex", () => {
  for (const cycleIndex of [0, 1, 2, 3, 4, 47, 48, 95, 96, 1000]) {
    const { index } = selectGnewsQuery(cycleIndex);
    assert.ok(index >= 0 && index < 4, `index ${index} out of bounds for cycleIndex ${cycleIndex}`);
  }
});

if (failed) process.exitCode = 1;
