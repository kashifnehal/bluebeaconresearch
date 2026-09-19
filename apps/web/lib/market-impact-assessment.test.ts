import assert from "node:assert/strict";
import type { EventCategory, Signal } from "@blue-beacon-research/shared";

import {
  EVENT_CATEGORY_LABELS,
  GPR_FALLBACK_SENTENCE,
  SOURCE_CONFIRMATION_LABELS,
  eventCategoryLabel,
  formatImpactDirections,
  noveltyLabel,
  parseEventCategory,
  parseNovelty,
  parseSourceConfirmation,
  sourceConfirmationLabel,
  usesGprFallback,
} from "./market-impact-assessment";

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

const ALL_CATEGORIES: EventCategory[] = [
  "armed_conflict_security",
  "supply_disruption_logistics",
  "sanctions_trade_policy",
  "production_output_decision",
  "central_bank_monetary_policy",
  "scheduled_economic_data",
  "official_statement_commentary",
  "elections_political_transition",
  "other_market_relevant",
];

runTest("maps all 9 event_category enum values to display names", () => {
  assert.equal(ALL_CATEGORIES.length, 9);
  assert.equal(Object.keys(EVENT_CATEGORY_LABELS).length, 9);
  assert.equal(
    eventCategoryLabel("armed_conflict_security"),
    "Armed Conflict & Security",
  );
  assert.equal(
    eventCategoryLabel("supply_disruption_logistics"),
    "Supply Disruption & Logistics",
  );
  for (const key of ALL_CATEGORIES) {
    const label = EVENT_CATEGORY_LABELS[key];
    assert.ok(label);
    assert.equal(label.includes("_"), false);
  }
  assert.equal(parseEventCategory("not_a_real_category"), null);
  assert.equal(eventCategoryLabel("conflict"), null);
});

runTest("GPR fallback only when mechanism and both impact lists are empty", () => {
  const empty: Pick<
    Signal,
    "marketMechanism" | "commodityImpacts" | "currencyPairImpacts"
  > = {
    marketMechanism: null,
    commodityImpacts: [],
    currencyPairImpacts: [],
  };
  assert.equal(usesGprFallback(empty), true);
  assert.equal(
    usesGprFallback({ ...empty, marketMechanism: "  " }),
    true,
  );
  assert.equal(
    usesGprFallback({
      ...empty,
      marketMechanism: "Threat to tanker traffic through the Strait of Hormuz → crude oil supply risk.",
    }),
    false,
  );
  assert.equal(
    usesGprFallback({
      ...empty,
      commodityImpacts: [{ asset: "USOIL", direction: "up", confidence: 0.88 }],
    }),
    false,
  );
  assert.equal(
    usesGprFallback({
      ...empty,
      currencyPairImpacts: [{ asset: "USDRUB", direction: "down", confidence: 0.55 }],
    }),
    false,
  );
});

runTest("fallback sentence is the exact Caldara & Iacoviello citation, not a live GPR number", () => {
  assert.equal(
    GPR_FALLBACK_SENTENCE,
    "No direct commodity match. Broad geopolitical risk events like this have historically been associated with a 5-10% move in equity indices and reduced oil demand within the following weeks (Caldara & Iacoviello, 2022).",
  );
  assert.equal(/GPR/i.test(GPR_FALLBACK_SENTENCE), false);
});

runTest("direction labels stay human-readable and drop a single shared direction", () => {
  assert.equal(
    formatImpactDirections([
      { asset: "USOIL", direction: "down", confidence: 0.68 },
      { asset: "UKOIL", direction: "down", confidence: 0.68 },
    ]),
    "Down",
  );
  assert.equal(
    formatImpactDirections([
      { asset: "USOIL", direction: "up", confidence: 0.8 },
      { asset: "XAUUSD", direction: "volatile", confidence: 0.6 },
    ]),
    "USOIL Up · XAUUSD Volatile",
  );
  assert.equal(formatImpactDirections([]), null);
});

runTest("source confirmation maps the three enum values and rejects unknown", () => {
  assert.equal(sourceConfirmationLabel("official"), "Official statement");
  assert.equal(sourceConfirmationLabel("reported"), "Reported claim");
  assert.equal(sourceConfirmationLabel("speculative"), "Speculative / unconfirmed");
  assert.equal(Object.keys(SOURCE_CONFIRMATION_LABELS).length, 3);
  assert.equal(parseSourceConfirmation("rumor"), null);
  assert.equal(sourceConfirmationLabel(null), null);
});

runTest("novelty labels are UI buckets, not raw decimals", () => {
  assert.equal(noveltyLabel(0.7), "New development");
  assert.equal(noveltyLabel(0.99), "New development");
  assert.equal(noveltyLabel(0.3), "Partial update");
  assert.equal(noveltyLabel(0.69), "Partial update");
  assert.equal(noveltyLabel(0.29), "Mostly a repeat/reminder");
  assert.equal(noveltyLabel(0), "Mostly a repeat/reminder");
  assert.equal(noveltyLabel(null), null);
  assert.equal(parseNovelty(1.2), null);
  assert.equal(parseNovelty("0.8"), 0.8);
  assert.equal(parseNovelty("nope"), null);
});
