import assert from "node:assert/strict";
import { shouldExclude } from "./relevance-filter.js";

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

// Must stay excluded — the real sports/entertainment/legacy-noise patterns the keywords
// and the year check are meant to catch.
const shouldStillExclude = [
  "Marathon runner wins city race",
  "Oscars awards ceremony red carpet",
  "Film festival opens in Cannes",
  "1973 oil crisis retrospective",
  "NFL trade deadline",
];

for (const title of shouldStillExclude) {
  runTest(`shouldExclude("${title}") is true`, () => {
    assert.equal(shouldExclude(title), true);
  });
}
