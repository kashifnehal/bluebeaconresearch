import assert from "node:assert/strict";
import { SHADOW_TERM_GROUPS, matchShadowGroups } from "./shadow-terms.js";

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

runTest("every group has a non-empty source", () => {
  for (const group of SHADOW_TERM_GROUPS) {
    assert.ok(group.source.length > 0, `group "${group.id}" has an empty source`);
  }
});

runTest("every group has a non-empty terms list", () => {
  for (const group of SHADOW_TERM_GROUPS) {
    assert.ok(group.terms.length > 0, `group "${group.id}" has an empty terms list`);
  }
});

runTest('matchShadowGroups matches "chokepoints" on a Hormuz headline', () => {
  assert.deepEqual(matchShadowGroups("Oil tanker queue builds near the Strait of Hormuz"), ["chokepoints"]);
});

runTest('matchShadowGroups matches "commodity-names" on a cotton headline', () => {
  assert.deepEqual(matchShadowGroups("Cotton harvest report shows lower yields this season"), ["commodity-names"]);
});

runTest("matchShadowGroups matches multiple groups when both terms are present", () => {
  const ids = matchShadowGroups("Drought near the Suez Canal threatens wheat shipments");
  assert.ok(ids.includes("chokepoints"));
  assert.ok(ids.includes("commodity-names"));
  assert.ok(ids.includes("event-weather"));
});

runTest("matchShadowGroups returns empty array when nothing matches", () => {
  assert.deepEqual(matchShadowGroups("Local bakery announces routine staff appointment"), []);
});

runTest("matchShadowGroups is whole-word, not substring", () => {
  // "corn" must not match inside "cornerstone"
  assert.deepEqual(matchShadowGroups("Cornerstone project breaks ground downtown"), []);
});
