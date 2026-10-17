import assert from "node:assert/strict";
import { CHOKEPOINTS } from "@blue-beacon-research/shared";
import { EVENT_CATEGORY_LABELS } from "./market-impact-assessment";
import {
  KEYWORD_PRESETS,
  chokepointWords,
  filterByKeywords,
  matchesKeywords,
  presetWords,
  toggleKeywordPreset,
  type KeywordSelection,
} from "./keyword-presets";

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

const categoryText = Object.values(EVENT_CATEGORY_LABELS).join(" ").toLowerCase();
const chokepointText = CHOKEPOINTS.map((c) => c.name).join(" ").toLowerCase();

runTest("all five presets exist", () => {
  assert.deepEqual(
    KEYWORD_PRESETS.map((p) => p.id),
    ["sanctions", "weather", "opec", "shipping", "conflict"],
  );
});

runTest("every preset word is traceable to a category name, chokepoint name, or the OPEC calendar entry", () => {
  const fromCalendar = new Set(["opec"]);
  for (const p of KEYWORD_PRESETS) {
    for (const w of p.words) {
      const ok = categoryText.includes(w) || chokepointText.includes(w) || fromCalendar.has(w);
      assert.equal(ok, true, `${p.id}: "${w}" has no source in the repo`);
    }
  }
});

runTest("weather has no sourced words and is the only empty preset", () => {
  assert.deepEqual(KEYWORD_PRESETS.filter((p) => p.words.length === 0).map((p) => p.id), ["weather"]);
});

runTest("chokepointWords keeps place words and drops demonyms", () => {
  const w = chokepointWords();
  assert.ok(w.includes("hormuz"));
  assert.ok(w.includes("suez"));
  assert.equal(w.includes("danish"), false);
});

runTest("matchesKeywords any vs all, case-insensitive", () => {
  assert.equal(matchesKeywords("OPEC raises production", ["opec", "output"], "any"), true);
  assert.equal(matchesKeywords("OPEC raises production", ["opec", "output"], "all"), false);
  assert.equal(matchesKeywords("OPEC raises output", ["opec", "output"], "all"), true);
  assert.equal(matchesKeywords("anything", [], "all"), true);
});

runTest("filterByKeywords passes everything with no words and filters on title or summary", () => {
  const rows = [
    { title: "New sanctions announced", summary: "" },
    { title: "Grain outlook", summary: "OPEC production update" },
    { title: "Grain outlook", summary: null },
  ];
  const none: KeywordSelection = { presets: [], mode: "any" };
  assert.equal(filterByKeywords(rows, none).length, 3);
  assert.equal(filterByKeywords(rows, { presets: ["weather"], mode: "any" }).length, 3);
  assert.equal(filterByKeywords(rows, { presets: ["sanctions"], mode: "any" }).length, 1);
  assert.equal(filterByKeywords(rows, { presets: ["sanctions", "opec"], mode: "any" }).length, 2);
  assert.equal(filterByKeywords(rows, { presets: ["sanctions", "opec"], mode: "all" }).length, 0);
});

runTest("presetWords unions without duplicates; toggleKeywordPreset adds and removes", () => {
  const w = presetWords(["opec", "opec", "conflict"]);
  assert.equal(new Set(w).size, w.length);
  let sel: KeywordSelection = { presets: [], mode: "any" };
  sel = toggleKeywordPreset(sel, "opec");
  assert.deepEqual(sel.presets, ["opec"]);
  sel = toggleKeywordPreset(sel, "opec");
  assert.deepEqual(sel.presets, []);
});
