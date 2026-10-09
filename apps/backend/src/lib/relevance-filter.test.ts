import assert from "node:assert/strict";
import { shouldExclude, findExcludeMatch, isRelevantEvent, dropReason, type FeedTier } from "./relevance-filter.js";

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
