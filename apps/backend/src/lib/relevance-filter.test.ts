import assert from "node:assert/strict";
import { shouldExclude, findExcludeMatch, isRelevantEvent, dropReason, type FeedTier } from "./relevance-filter.js";

// Existing fixtures below are the flag-off answers. Read the pair rule at call time
// only after those assertions, then restore it.
delete process.env.T2_PAIR_RULE;

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

// Previously false-dropped before the classifier ever saw them: a bare substring match
// ("marathon"/"award"/"film" keywords, or a year digit-string inside a larger number)
// was excluding real commodity/market headlines with no trace.
const shouldNotExclude = [
  "Marathon Petroleum cuts refinery runs after unit outage",
  "Oil output rises to 12000 barrels per day at Libyan field",
  "Nikkei closes at 41970 as yen weakens",
  "Contract award for Gulf of Mexico offshore block",
  "Thin film solar module maker faces tariff",
  "Rising inflation squeezes household budgets",
  "Ukraine conflict escalates near eastern border",
];

for (const title of shouldNotExclude) {
  runTest(`shouldExclude("${title}") is false`, () => {
    assert.equal(shouldExclude(title), false);
  });
}

// Must stay excluded — the real sports/entertainment/legacy-noise HARD patterns.
const shouldStillExclude = [
  "Marathon runner wins city race",
  "Oscars awards ceremony red carpet",
  "Film festival opens in Cannes",
  "NFL trade deadline",
];

for (const title of shouldStillExclude) {
  runTest(`shouldExclude("${title}") is true`, () => {
    assert.equal(shouldExclude(title), true);
  });
}

// Year rule is log-only now — a historical-year headline is no longer hard-dropped
// by shouldExclude(), only logged via "[RELEVANCE] exclude-year would-drop".
runTest('shouldExclude("1973 oil crisis retrospective") is false (year is log-only)', () => {
  assert.equal(shouldExclude("1973 oil crisis retrospective"), false);
});

runTest('shouldExclude() does not treat "$2000" as a year', () => {
  // Whole-number year match only — "$2000" is a dollar amount, not the year 2000,
  // and must not fire the exclude-year log path or any drop.
  assert.equal(shouldExclude("Contract worth $2000 awarded for pipeline maintenance"), false);
});

// AMBIGUOUS exclude keywords — dropped only when the title+summary has no anchor
// (an existing geopolitical word or a tracked commodity name).
runTest('shouldExclude("Fashion week highlights draw record crowds") is true (no anchor)', () => {
  assert.equal(shouldExclude("Fashion week highlights draw record crowds"), true);
});

runTest('shouldExclude("Fashion retailer faces embargo amid sanctions") is false (anchor: embargo/sanction)', () => {
  assert.equal(shouldExclude("Fashion retailer faces embargo amid sanctions"), false);
});

runTest('shouldExclude("War game video released for consoles this fall") is true (no anchor)', () => {
  assert.equal(shouldExclude("War game video released for consoles this fall"), true);
});

runTest('shouldExclude("War game exercise held by military alliance") is false (anchor: military)', () => {
  assert.equal(shouldExclude("War game exercise held by military alliance"), false);
});

runTest('shouldExclude("Trade deadline passes quietly this afternoon") is true (no anchor)', () => {
  assert.equal(shouldExclude("Trade deadline passes quietly this afternoon"), true);
});

runTest('shouldExclude("Oil tanker trade deadline dispute at the Strait of Hormuz") is false (anchor: oil/tanker/strait/hormuz)', () => {
  assert.equal(
    shouldExclude("Oil tanker trade deadline dispute at the Strait of Hormuz"),
    false,
  );
});

// findExcludeMatch() — diagnostic phrase + location (title vs. summary) for the
// [RSS-DROP] sample log.
runTest("findExcludeMatch reports a HARD phrase matched in the title", () => {
  const match = findExcludeMatch("Oscars awards ceremony red carpet", "A quiet night in Hollywood");
  assert.deepEqual(match, { phrase: "awards ceremony", location: "title" });
});

runTest("findExcludeMatch reports a phrase matched only in the summary", () => {
  const match = findExcludeMatch(
    "Market roundup: shares mixed in afternoon trading",
    "Also today: celebrity chef opens new restaurant downtown",
  );
  assert.deepEqual(match, { phrase: "celebrity", location: "summary" });
});

runTest("findExcludeMatch returns null when an AMBIGUOUS phrase is anchored", () => {
  assert.equal(findExcludeMatch("Fashion retailer faces embargo amid sanctions"), null);
});

runTest("findExcludeMatch returns null when nothing matches", () => {
  assert.equal(findExcludeMatch("Ukraine conflict escalates near eastern border"), null);
});

// FeedTier bypass — "official" skips the geopolitical/market keyword gate, same
// as "finance", once past the exclude/noise checks above.
runTest('isRelevantEvent("official" tier) accepts a headline with no geopolitical/market keyword', () => {
  assert.equal(
    isRelevantEvent("Federal Reserve announces routine staff appointment", "", "official"),
    true,
  );
});

runTest('isRelevantEvent("world" tier) still requires a keyword match', () => {
  assert.equal(
    isRelevantEvent("Local bakery announces routine staff appointment", "", "world"),
    false,
  );
});

runTest('isRelevantEvent("official" tier) still drops a HARD-excluded headline', () => {
  assert.equal(isRelevantEvent("Federal Reserve staffer runs marathon race for charity", "", "official"), false);
});

// "cooking" moved from HARD to AMBIGUOUS (2026-10-10) — real commodity headlines with
// an anchor are no longer silently dropped.
runTest('isRelevantEvent("Cooking oil prices surge after Indonesia export ban") is true (anchor: oil)', () => {
  assert.equal(isRelevantEvent("Cooking oil prices surge after Indonesia export ban"), true);
});

runTest('isRelevantEvent("India raises cooking gas cylinder price") is true (anchor: gas)', () => {
  assert.equal(isRelevantEvent("India raises cooking gas cylinder price"), true);
});

runTest('shouldExclude("Cooking show returns for a new season") is true (no anchor)', () => {
  assert.equal(shouldExclude("Cooking show returns for a new season"), true);
});

// dropReason() parity — must give the same keep/drop answer as isRelevantEvent() for
// every fixture used above, just with a named reason instead of a boolean.
const dropReasonParityFixtures: { title: string; summary?: string; tier?: FeedTier }[] = [
  ...shouldNotExclude.map((title) => ({ title })),
  ...shouldStillExclude.map((title) => ({ title })),
  { title: "1973 oil crisis retrospective" },
  { title: "Contract worth $2000 awarded for pipeline maintenance" },
  { title: "Fashion week highlights draw record crowds" },
  { title: "Fashion retailer faces embargo amid sanctions" },
  { title: "War game video released for consoles this fall" },
  { title: "War game exercise held by military alliance" },
  { title: "Trade deadline passes quietly this afternoon" },
  { title: "Oil tanker trade deadline dispute at the Strait of Hormuz" },
  { title: "Federal Reserve announces routine staff appointment", tier: "official" },
  { title: "Local bakery announces routine staff appointment", tier: "world" },
  { title: "Federal Reserve staffer runs marathon race for charity", tier: "official" },
  { title: "Cooking oil prices surge after Indonesia export ban" },
  { title: "India raises cooking gas cylinder price" },
  { title: "Cooking show returns for a new season" },
  { title: "India extends sugar export ban through September" },
  { title: "Brazil sugar mills divert more cane to ethanol as gasoline prices rise" },
  { title: "Thailand drought cuts sugar cane output forecast" },
  { title: "Severe frost damages Brazil coffee crop" },
  { title: "US removes tariff on Brazilian coffee imports" },
  { title: "Coffee prices jump as Vietnam harvest delayed by floods" },
  { title: "Ghana raises cocoa farmgate price for 2026/27 season" },
  { title: "Ivory Coast cocoa arrivals fall as swollen shoot disease spreads" },
  { title: "EU delays deforestation rules, cocoa traders welcome reprieve" },
  { title: "Indonesia raises palm oil export levy to fund biodiesel" },
  { title: "India cuts import duty on edible oils" },
  { title: "China imposes anti-dumping duties on Canadian canola" },
  { title: "Black Sea port attacks disrupt sunflower oil shipments" },
  { title: "China cuts soybean purchases from US amid tariff dispute" },
  { title: "Argentina lowers soybean export tax" },
  { title: "Brazil soybean planting delayed by dry weather" },
  { title: "LME bans new Russian aluminium after sanctions" },
  { title: "Gulf aluminium smelters cut output after Hormuz closure" },
  { title: "US doubles tariff on aluminium imports" },
  { title: "Indonesia cuts nickel ore mining quota" },
  { title: "Nickel jumps as Indonesia halts mine permits" },
  { title: "Nornickel output hit by sanctions on Russian metals" },
  { title: "Starbucks sugar-free drink lawsuit settled" },
  { title: "Purebread to acquire Caffe Artigiano coffee chain" },
];

for (const { title, summary = "", tier = "world" } of dropReasonParityFixtures) {
  runTest(`dropReason/isRelevantEvent parity for "${title}" (tier=${tier})`, () => {
    const kept = isRelevantEvent(title, summary, tier);
    const reason = dropReason(title, summary, tier);
    assert.equal(reason === null, kept);
  });
}

runTest('dropReason() names the exclude phrase and location', () => {
  assert.equal(dropReason("Oscars awards ceremony red carpet", "A quiet night in Hollywood"), "exclude:awards ceremony@title");
});

runTest('dropReason() names the noise pattern', () => {
  assert.equal(
    dropReason("Jane Smith, Chief Financial Officer, sells $1.2M in company shares"),
    "noise:insider",
  );
});

runTest('dropReason() returns "nokeyword" for a world-tier miss with no year', () => {
  assert.equal(dropReason("Local bakery announces routine staff appointment", "", "world"), "nokeyword");
});

runTest('dropReason() returns null for a finance/official-tier keep', () => {
  assert.equal(dropReason("Federal Reserve announces routine staff appointment", "", "official"), null);
});

runTest("dropReason/isRelevantEvent parity holds with the pair rule on, and finance stays unchanged", () => {
  process.env.T2_PAIR_RULE = "true";
  try {
    for (const { title, summary = "", tier = "world" } of dropReasonParityFixtures) {
      assert.equal(dropReason(title, summary, tier) === null, isRelevantEvent(title, summary, tier), title);
    }
    assert.equal(isRelevantEvent("Local bakery announces routine staff appointment", "", "finance"), true);
    assert.equal(dropReason("Local bakery announces routine staff appointment", "", "finance"), null);
    assert.equal(isRelevantEvent("Football league extends sugar export ban"), false);
  } finally {
    delete process.env.T2_PAIR_RULE;
  }
});

// Old assets already kept by the keyword lists. The pair rule may only add keeps.
const oldAssetHeadlines = [
  "Oil output rises to 13000 barrels per day at a Libyan field",
  "Marathon Petroleum cuts refinery runs after an oil unit outage",
  "Cooking oil prices surge after a fresh Indonesia export ban",
  "Oil tanker traffic slows near the Strait of Hormuz",
  "Crude oil shipments resume after a refinery fire",
  "India raises cooking gas cylinder price for households",
  "Natural gas flows resume after a pipeline repair",
  "European gas storage falls as heating demand rises",
  "A gas pipeline blast cuts flows through a southern corridor",
  "Gas cargoes reroute away from a closed terminal",
  "Gold price holds steady as the dollar softens",
  "Central bank gold buying lifts bullion holdings",
  "Gold miners halt a shift after a pit flood warning",
  "Spot gold climbs after a fresh inflation print",
  "Silver price jumps as solar demand firms",
  "Silver output falls at a major Mexican mine",
  "Industrial silver demand rises with electronics orders",
  "Silver holdings in exchange warehouses decline",
  "Copper shipments stall after a mine strike in Chile",
  "Copper price firms as smelter maintenance spreads",
  "A copper concentrate queue waits at the port",
  "Copper stocks in warehouses fall to a multi-month low",
  "Wheat exports slow as a drought cuts the harvest",
  "Wheat prices rise after a Black Sea shipment delay",
  "Winter wheat acres slip after a dry planting window",
  "Wheat cargoes queue outside a crowded grain port",
  "Corn exports rise after a Gulf elevator reopens",
  "Corn crop estimates fall after a late frost",
  "Corn demand from feed mills stays firm this month",
  "Record corn stocks weigh on the harvest outlook",
];

const propertyFixtures: { title: string; summary?: string; tier?: FeedTier }[] = [
  ...dropReasonParityFixtures,
  { title: "Jane Smith, Chief Financial Officer, sells $1.2M in company shares" },
  { title: "Oscars awards ceremony red carpet", summary: "A quiet night in Hollywood" },
  {
    title: "Market roundup: shares mixed in afternoon trading",
    summary: "Also today: celebrity chef opens new restaurant downtown",
  },
  { title: "Football league extends sugar export ban" },
  ...oldAssetHeadlines.map((title) => ({ title })),
];

runTest("pair rule never removes a flag-off keep, including 30 old-asset headlines", () => {
  assert.equal(oldAssetHeadlines.length, 30);
  const saved = process.env.T2_PAIR_RULE;
  try {
    delete process.env.T2_PAIR_RULE;
    for (const title of oldAssetHeadlines) {
      assert.equal(isRelevantEvent(title), true, `old asset dropped with the flag off: ${title}`);
    }
    let checked = 0;
    for (const { title, summary = "", tier = "world" } of propertyFixtures) {
      delete process.env.T2_PAIR_RULE;
      const off = isRelevantEvent(title, summary, tier);
      process.env.T2_PAIR_RULE = "true";
      const on = isRelevantEvent(title, summary, tier);
      const capped = isRelevantEvent(title, summary, tier, { t2PairAllowed: false });
      if (off === true) {
        assert.equal(on, true, `flag on dropped a keep: ${title}`);
        assert.equal(capped, true, `daily cap dropped a keep: ${title}`);
      }
      assert.equal(dropReason(title, summary, tier) === null, on, `parity flag on: ${title}`);
      assert.equal(
        dropReason(title, summary, tier, { t2PairAllowed: false }) === null,
        capped,
        `parity cap: ${title}`,
      );
      checked += 1;
    }
    assert.equal(checked, propertyFixtures.length);
    console.log(`property fixtures checked: ${checked} (includes ${oldAssetHeadlines.length} old-asset headlines)`);
  } finally {
    if (saved === undefined) delete process.env.T2_PAIR_RULE;
    else process.env.T2_PAIR_RULE = saved;
  }
});

runTest("finance and official tiers are identical with the pair rule on and off", () => {
  const saved = process.env.T2_PAIR_RULE;
  try {
    for (const tier of ["finance", "official"] as const) {
      for (const { title, summary = "" } of propertyFixtures) {
        delete process.env.T2_PAIR_RULE;
        const off = isRelevantEvent(title, summary, tier);
        process.env.T2_PAIR_RULE = "true";
        const on = isRelevantEvent(title, summary, tier);
        const capped = isRelevantEvent(title, summary, tier, { t2PairAllowed: false });
        assert.equal(on, off, `${tier} flag: ${title}`);
        assert.equal(capped, off, `${tier} cap: ${title}`);
        assert.equal(dropReason(title, summary, tier) === null, on, `${tier} parity: ${title}`);
      }
    }
  } finally {
    if (saved === undefined) delete process.env.T2_PAIR_RULE;
    else process.env.T2_PAIR_RULE = saved;
  }
});
