import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

// selectGnewsQuery is pure (cycleIndex in, {query, index} out) — no network/Supabase
// involved, so this only exercises the rotation math introduced by W7-GNEWS-ROTATE.
const { selectGnewsQuery, GNEWS_QUERY_COUNT } = await import("./gnews-collector.js");

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

runTest("cycles through every query once per full rotation before repeating", () => {
  const seen = new Set<string>();
  for (let i = 0; i < GNEWS_QUERY_COUNT; i++) {
    const { query, index } = selectGnewsQuery(i);
    assert.equal(index, i);
    seen.add(query);
  }
  assert.equal(seen.size, GNEWS_QUERY_COUNT, "every query in one rotation must be distinct");
  assert.deepEqual(
    selectGnewsQuery(GNEWS_QUERY_COUNT),
    selectGnewsQuery(0),
    "index wraps back to index 0 after one full rotation",
  );
});

runTest("wraps around with modulo past one full rotation", () => {
  assert.deepEqual(selectGnewsQuery(GNEWS_QUERY_COUNT + 1), selectGnewsQuery(1));
  assert.deepEqual(selectGnewsQuery(GNEWS_QUERY_COUNT * 2), selectGnewsQuery(0));
  // 48 cycles/day (every 30 min) is the real production cadence (see comment above
  // GNEWS_QUERIES) — confirm it still resolves within bounds after many rotations.
  assert.deepEqual(selectGnewsQuery(48 * 2 + 1), selectGnewsQuery(1));
});

runTest("negative cycleIndex still resolves to a valid, non-negative query index", () => {
  const { index } = selectGnewsQuery(-1);
  assert.equal(index, GNEWS_QUERY_COUNT - 1);
  assert.deepEqual(selectGnewsQuery(-1), selectGnewsQuery(GNEWS_QUERY_COUNT - 1));
});

runTest("index always stays within query bounds regardless of cycleIndex", () => {
  for (const cycleIndex of [0, 1, 2, 3, 4, 47, 48, 95, 96, 1000]) {
    const { index } = selectGnewsQuery(cycleIndex);
    assert.ok(index >= 0 && index < GNEWS_QUERY_COUNT, `index ${index} out of bounds for cycleIndex ${cycleIndex}`);
  }
});

if (failed) process.exitCode = 1;
