import assert from "node:assert/strict";
import {
  formatWatchlistPromptBlock,
  matchWatchlistEntity,
  sanitizeMediaImpactEntity,
  shortMediaImpactCaveat,
  type MediaImpactWatchlistEntry,
} from "./media-impact-watchlist.js";

const SAMPLE: MediaImpactWatchlistEntry[] = [
  {
    entityName: "OPEC",
    entityAliases: ["OPEC+", "Organization of the Petroleum Exporting Countries"],
    tier: "institutional_official",
    markets: ["USOIL", "UKOIL"],
    statementType: "official communication",
    evidenceSummary: "Fed working paper",
    evidenceSources: ["https://example.com/opec"],
    caveat:
      "Official OPEC statements have historically REDUCED oil volatility (stabilizing/reassuring), not spiked it.",
  },
  {
    entityName: "Saudi Arabia's Energy Minister",
    entityAliases: ["Prince Abdulaziz bin Salman", "Abdulaziz bin Salman"],
    tier: "institutional_official",
    markets: ["USOIL", "UKOIL"],
    statementType: "public statement",
    evidenceSummary: "Dated Bloomberg/CNBC instances",
    evidenceSources: ["https://example.com/saudi"],
    caveat: "Real, dated, specific evidence — stronger than the generic OPEC entry.",
  },
  {
    entityName: "Elon Musk",
    entityAliases: ["Musk"],
    tier: "individual_social_media",
    markets: [],
    statementType: "public social-media post",
    evidenceSummary: "CNBC / SEC fine",
    evidenceSources: ["https://example.com/musk"],
    caveat: "Same transience caveat as the academic literature.",
  },
];

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

runTest("prompt block uses the same - name — caveat format as #141", () => {
  const block = formatWatchlistPromptBlock(SAMPLE);
  assert.match(block, /^- OPEC — Official OPEC statements/m);
  assert.match(block, /Saudi Arabia's Energy Minister/);
  assert.match(block, /Elon Musk/);
  assert.equal(block.includes("Cathie Wood"), false);
  assert.equal(block.includes("Michael Saylor"), false);
});

runTest("matchWatchlistEntity hits name and aliases, misses unsourced names", () => {
  assert.equal(matchWatchlistEntity("OPEC holds an extraordinary meeting", SAMPLE), "OPEC");
  assert.equal(
    matchWatchlistEntity("Prince Abdulaziz bin Salman spoke in Riyadh", SAMPLE),
    "Saudi Arabia's Energy Minister",
  );
  assert.equal(matchWatchlistEntity("Elon Musk posted overnight", SAMPLE), "Elon Musk");
  assert.equal(matchWatchlistEntity("Cathie Wood discussed ARKK flows", SAMPLE), null);
  assert.equal(matchWatchlistEntity("Michael Saylor bought more bitcoin", SAMPLE), null);
});

runTest("sanitizeMediaImpactEntity maps aliases and rejects invented names", () => {
  assert.equal(sanitizeMediaImpactEntity("OPEC", SAMPLE), "OPEC");
  assert.equal(
    sanitizeMediaImpactEntity("Prince Abdulaziz bin Salman", SAMPLE),
    "Saudi Arabia's Energy Minister",
  );
  assert.equal(sanitizeMediaImpactEntity("Cathie Wood", SAMPLE), null);
  assert.equal(sanitizeMediaImpactEntity("Michael Saylor", SAMPLE), null);
  assert.equal(sanitizeMediaImpactEntity("", SAMPLE), null);
  assert.equal(sanitizeMediaImpactEntity(null, SAMPLE), null);
});

runTest("shortMediaImpactCaveat keeps the first sentence only", () => {
  const short = shortMediaImpactCaveat(
    "Official OPEC statements have historically REDUCED oil volatility (stabilizing/reassuring), not spiked it. Reserve high severity for an actual OPEC+ production/output decision.",
  );
  assert.match(short, /REDUCED oil volatility/);
  assert.equal(short.includes("Reserve high severity"), false);
});
