import assert from "node:assert/strict";
import { dropReason, isRelevantEvent, type FeedTier } from "./relevance-filter.js";
import {
  isT2PairRuleEnabled,
  matchesT2Pair,
  T2_ASSET_TERMS,
  T2_COMMON_POLICY,
  T2_COMMON_SUPPLY,
  T2_GDELT_QUERY_CANDIDATES,
  T2_GNEWS_QUERIES,
  T2_SHADOW_SOURCE,
} from "./t2-terms.js";

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

const EXPECTED_ASSET: Record<string, string> = {
  SUGAR: "SUGAR",
  COFFEE: "COFFEE",
  COCOA: "COCOA",
  VEG_OILS: "VEG_OILS",
  SOY: "SOYBEANS",
  ALUM: "ALUMINIUM",
  NICKEL: "NICKEL",
};

const HEADLINES: { group: string; title: string }[] = [
  { group: "SUGAR", title: "India extends sugar export ban through September" },
  { group: "SUGAR", title: "Brazil sugar mills divert more cane to ethanol as gasoline prices rise" },
  { group: "SUGAR", title: "Thailand drought cuts sugar cane output forecast" },
  { group: "COFFEE", title: "Severe frost damages Brazil coffee crop" },
  { group: "COFFEE", title: "US removes tariff on Brazilian coffee imports" },
  { group: "COFFEE", title: "Coffee prices jump as Vietnam harvest delayed by floods" },
  { group: "COCOA", title: "Ghana raises cocoa farmgate price for 2026/27 season" },
  { group: "COCOA", title: "Ivory Coast cocoa arrivals fall as swollen shoot disease spreads" },
  { group: "COCOA", title: "EU delays deforestation rules, cocoa traders welcome reprieve" },
  { group: "VEG_OILS", title: "Indonesia raises palm oil export levy to fund biodiesel" },
  { group: "VEG_OILS", title: "India cuts import duty on edible oils" },
  { group: "VEG_OILS", title: "China imposes anti-dumping duties on Canadian canola" },
  { group: "VEG_OILS", title: "Black Sea port attacks disrupt sunflower oil shipments" },
  { group: "SOY", title: "China cuts soybean purchases from US amid tariff dispute" },
  { group: "SOY", title: "Argentina lowers soybean export tax" },
  { group: "SOY", title: "Brazil soybean planting delayed by dry weather" },
  { group: "ALUM", title: "LME bans new Russian aluminium after sanctions" },
  { group: "ALUM", title: "Gulf aluminium smelters cut output after Hormuz closure" },
  { group: "ALUM", title: "US doubles tariff on aluminium imports" },
  { group: "NICKEL", title: "Indonesia cuts nickel ore mining quota" },
  { group: "NICKEL", title: "Nickel jumps as Indonesia halts mine permits" },
  { group: "NICKEL", title: "Nornickel output hit by sanctions on Russian metals" },
  { group: "CTRL", title: "Starbucks sugar-free drink lawsuit settled" },
  { group: "CTRL", title: "Purebread to acquire Caffe Artigiano coffee chain" },
];

const savedPairRule = process.env.T2_PAIR_RULE;
delete process.env.T2_PAIR_RULE;

runTest("every asset, alias, event, and common term is lowercase and sourced", () => {
  assert.equal(T2_ASSET_TERMS.length, 7);
  assert.ok(T2_SHADOW_SOURCE.length > 0);
  const groups = [T2_COMMON_POLICY, T2_COMMON_SUPPLY];
  for (const group of groups) {
    assert.ok(group.source.length > 0, group.id);
    for (const term of group.terms) assert.equal(term, term.toLowerCase().trim(), term);
  }
  for (const asset of T2_ASSET_TERMS) {
    assert.ok(asset.source.length > 0, asset.id);
    assert.ok(asset.aliases.length > 0, asset.id);
    assert.ok(asset.events.length > 0, asset.id);
    for (const term of [...asset.aliases, ...asset.events]) {
      assert.equal(term, term.toLowerCase().trim(), `${asset.id}:${term}`);
    }
  }
});

runTest("GNews candidate queries are the two specified strings, each at most 200 characters", () => {
  assert.deepEqual(T2_GNEWS_QUERIES, [
    '(soybeans OR "palm oil" OR "sunflower oil" OR canola OR sugar OR coffee OR cocoa) AND (export OR tariff OR ban OR quota OR levy OR drought OR frost OR harvest)',
    "(aluminium OR aluminum OR nickel) AND (smelter OR sanctions OR tariff OR quota OR ban OR output OR strike OR LME)",
  ]);
  for (const query of T2_GNEWS_QUERIES) assert.ok(query.length <= 200, `${query.length}`);
});

runTest("GDELT V2 is the first parenthesised group of V1 plus sourcelang:eng", () => {
  const v1 = T2_GDELT_QUERY_CANDIDATES[0];
  const firstGroup = v1.slice(0, v1.indexOf(")") + 1);
  assert.equal(T2_GDELT_QUERY_CANDIDATES[1], `${firstGroup} sourcelang:eng`);
  assert.equal(
    T2_GDELT_QUERY_CANDIDATES[0],
    '(soybeans OR "palm oil" OR "sunflower oil" OR canola OR sugar OR coffee OR cocoa OR aluminium OR aluminum OR nickel) (export OR tariff OR ban OR quota OR levy OR drought OR frost OR smelter OR sanctions) sourcelang:eng',
  );
});

runTest("isT2PairRuleEnabled reads T2_PAIR_RULE at call time and accepts only true", () => {
  delete process.env.T2_PAIR_RULE;
  assert.equal(isT2PairRuleEnabled(), false);
  process.env.T2_PAIR_RULE = "TRUE";
  assert.equal(isT2PairRuleEnabled(), false);
  process.env.T2_PAIR_RULE = "true";
  assert.equal(isT2PairRuleEnabled(), true);
  delete process.env.T2_PAIR_RULE;
});

runTest("a longer word does not match a shorter alias", () => {
  assert.equal(matchesT2Pair("Sugary export ban announced today"), null);
});

const unmatched: string[] = [];
let keywordDrops = 0;
console.log("--- t2 headline scan ---");
for (const { group, title } of HEADLINES) {
  const pair = matchesT2Pair(title);
  const keywordKept = isRelevantEvent(title);
  const keyword = keywordKept ? "KEEP" : "DROP";
  console.log(`${pair ? "MATCH" : "MISS"}\t${group}\tasset=${pair?.asset ?? "-"}\tkeyword=${keyword}\t${title}`);
  if (group === "CTRL") {
    assert.equal(pair, null, title);
  } else if (!pair) {
    unmatched.push(`${group}: ${title}`);
  } else {
    assert.equal(pair.asset, EXPECTED_ASSET[group], title);
  }
  if (group !== "CTRL" && !keywordKept) keywordDrops += 1;
}
console.log(`unmatched ${unmatched.length} of 22`);
for (const line of unmatched) console.log(`UNMATCHED ${line}`);
console.log(`keyword drops ${keywordDrops} of 22 with the pair rule off`);

runTest("the two control headlines do not match a T2 pair", () => {
  for (const { group, title } of HEADLINES) {
    if (group !== "CTRL") continue;
    assert.equal(matchesT2Pair(title), null, title);
  }
});

const flagOffFixtures: { title: string; tier?: FeedTier; kept: boolean }[] = [
  { title: "Federal Reserve announces routine staff appointment", tier: "official", kept: true },
  { title: "Local bakery announces routine staff appointment", tier: "world", kept: false },
  { title: "Federal Reserve staffer runs marathon race for charity", tier: "official", kept: false },
  { title: "Cooking oil prices surge after Indonesia export ban", kept: true },
  { title: "India raises cooking gas cylinder price", kept: true },
  { title: "Cooking show returns for a new season", kept: false },
  { title: "Ukraine conflict escalates near eastern border", kept: true },
  { title: "Fashion week highlights draw record crowds", kept: false },
];

runTest("with the pair rule off, existing relevance fixtures keep the same answers", () => {
  delete process.env.T2_PAIR_RULE;
  for (const { title, tier = "world", kept } of flagOffFixtures) {
    assert.equal(isRelevantEvent(title, "", tier), kept, title);
    assert.equal(dropReason(title, "", tier) === null, kept, title);
  }
});

runTest("with the pair rule on, the finance tier is unchanged and dropReason stays aligned", () => {
  process.env.T2_PAIR_RULE = "true";
  try {
    assert.equal(isRelevantEvent("Local bakery announces routine staff appointment", "", "finance"), true);
    assert.equal(dropReason("Local bakery announces routine staff appointment", "", "finance"), null);
    assert.equal(isRelevantEvent("Federal Reserve announces routine staff appointment", "", "official"), true);
    assert.equal(isRelevantEvent("Cooking show returns for a new season", "", "finance"), false);
    assert.equal(isRelevantEvent("Football league extends sugar export ban", "", "world"), false);
    for (const { title, tier = "world", kept } of flagOffFixtures) {
      assert.equal(isRelevantEvent(title, "", tier), kept, `flag on ${title}`);
      assert.equal(dropReason(title, "", tier) === null, isRelevantEvent(title, "", tier), title);
    }
    for (const { group, title } of HEADLINES) {
      assert.equal(dropReason(title) === null, isRelevantEvent(title), `${group} ${title}`);
    }
  } finally {
    delete process.env.T2_PAIR_RULE;
  }
});

runTest("a pair-only world headline is dropped with the flag off and kept with the flag on", () => {
  const title = "India extends sugar export ban through September";
  delete process.env.T2_PAIR_RULE;
  assert.equal(matchesT2Pair(title)?.asset, "SUGAR");
  assert.equal(isRelevantEvent(title), false);
  assert.equal(dropReason(title), "nokeyword");
  process.env.T2_PAIR_RULE = "true";
  try {
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      assert.equal(isRelevantEvent(title), true);
      assert.equal(dropReason(title), null);
    } finally {
      console.log = original;
    }
    assert.ok(logs.some((line) => line.startsWith('[RELEVANCE] t2-pair keep asset=SUGAR title="')));
    assert.equal(isRelevantEvent(title, "", "finance"), true);
  } finally {
    delete process.env.T2_PAIR_RULE;
  }
});

if (savedPairRule === undefined) delete process.env.T2_PAIR_RULE;
else process.env.T2_PAIR_RULE = savedPairRule;
