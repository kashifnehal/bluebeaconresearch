import assert from "node:assert/strict";
import type { EventCategory, Signal } from "@blue-beacon-research/shared";

import {
  EVENT_CATEGORY_LABELS,
  GPR_FALLBACK_SENTENCE,
  GRAIN_FALLBACK_SENTENCE,
  MARKET_IMPACT_MIN_SAMPLE_SIZE,
  SOURCE_CONFIRMATION_LABELS,
  computeMarketImpactCheckpoints,
  computeMarketImpactMagnitude,
  deriveTimeHorizonLabel,
  eventCategoryLabel,
  formatImpactDirections,
  isGrainAsset,
  noveltyLabel,
  parseEventCategory,
  parseNovelty,
  parseSourceConfirmation,
  sourceConfirmationLabel,
  usesGprFallback,
  type SignalOutcomeRow,
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

function outcomeRows(
  asset: string,
  checkpointHours: number,
  values: number[],
): SignalOutcomeRow[] {
  return values.map((actual_pct_change) => ({
    asset,
    checkpoint_hours: checkpointHours,
    actual_pct_change,
  }));
}

runTest("market impact magnitude is gated at MIN_SAMPLE_SIZE (20)", () => {
  const belowGate = outcomeRows("WHEAT", 24, new Array(19).fill(1));
  assert.equal(computeMarketImpactMagnitude(belowGate, "WHEAT", 24), null);

  const atGate = outcomeRows("WHEAT", 24, new Array(20).fill(1));
  const result = computeMarketImpactMagnitude(atGate, "WHEAT", 24);
  assert.ok(result);
  assert.equal(result?.sampleSize, 20);
  assert.equal(MARKET_IMPACT_MIN_SAMPLE_SIZE, 20);
});

runTest("magnitude uses median of |actual_pct_change|, robust to a single outlier", () => {
  // 20 rows near ~1%, one 30% data-glitch-style outlier. Median should stay
  // near 1%; a mean would be dragged up to nearly 2.5%.
  const values = [...new Array(20).fill(1), 30];
  const rows = outcomeRows("USOIL", 24, values);
  const result = computeMarketImpactMagnitude(rows, "USOIL", 24);
  assert.ok(result);
  assert.equal(result?.sampleSize, 21);
  assert.ok(result!.medianMovePct < 1.5, `expected median near 1%, got ${result?.medianMovePct}`);
});

runTest("magnitude is computed per asset/checkpoint, ignoring other rows", () => {
  const rows = [
    ...outcomeRows("USOIL", 24, new Array(25).fill(2)),
    ...outcomeRows("WHEAT", 24, new Array(25).fill(5)),
    ...outcomeRows("USOIL", 48, new Array(25).fill(9)),
  ];
  assert.equal(computeMarketImpactMagnitude(rows, "USOIL", 24)?.medianMovePct, 2);
  assert.equal(computeMarketImpactMagnitude(rows, "WHEAT", 24)?.medianMovePct, 5);
  assert.equal(computeMarketImpactMagnitude(rows, "USOIL", 48)?.medianMovePct, 9);
});

runTest("time-horizon label picks the checkpoint with the largest median move, gated per-checkpoint", () => {
  // 24h/48h clear the gate; 1h/4h do not — the peak among 1h/4h (even if
  // numerically larger) must not win because it can't clear the gate.
  const rows = [
    ...outcomeRows("USOIL", 1, new Array(5).fill(50)),
    ...outcomeRows("USOIL", 4, new Array(5).fill(50)),
    ...outcomeRows("USOIL", 24, new Array(25).fill(1)),
    ...outcomeRows("USOIL", 48, new Array(25).fill(3)),
  ];
  assert.equal(deriveTimeHorizonLabel(rows, "USOIL"), "multi-day");
});

runTest("time-horizon label maps checkpoints to the three horizon buckets", () => {
  assert.equal(
    deriveTimeHorizonLabel(outcomeRows("USOIL", 1, new Array(25).fill(1)), "USOIL"),
    "within hours",
  );
  assert.equal(
    deriveTimeHorizonLabel(outcomeRows("USOIL", 24, new Array(25).fill(1)), "USOIL"),
    "within a day",
  );
  assert.equal(
    deriveTimeHorizonLabel(outcomeRows("USOIL", 48, new Array(25).fill(1)), "USOIL"),
    "multi-day",
  );
});

runTest("time-horizon label is null when no checkpoint clears the gate", () => {
  const rows = outcomeRows("EURUSD", 24, new Array(19).fill(1));
  assert.equal(deriveTimeHorizonLabel(rows, "EURUSD"), null);
});

runTest("checkpoint chart data skips any checkpoint that doesn't individually clear the gate", () => {
  const rows = [
    ...outcomeRows("USOIL", 1, new Array(5).fill(4)), // below gate
    ...outcomeRows("USOIL", 4, new Array(25).fill(2)),
    ...outcomeRows("USOIL", 24, new Array(30).fill(1)),
    // no 48h rows at all
  ];
  const points = computeMarketImpactCheckpoints(rows, "USOIL");
  assert.deepEqual(
    points.map((p) => p.checkpointHours),
    [4, 24],
  );
  assert.equal(points.find((p) => p.checkpointHours === 4)?.medianMovePct, 2);
  assert.equal(points.find((p) => p.checkpointHours === 4)?.sampleSize, 25);
  assert.equal(points.find((p) => p.checkpointHours === 24)?.medianMovePct, 1);
});

runTest("checkpoint chart data is empty (not zeros) when nothing clears the gate", () => {
  const rows = outcomeRows("EURUSD", 24, new Array(19).fill(1));
  assert.deepEqual(computeMarketImpactCheckpoints(rows, "EURUSD"), []);
});

runTest("grain fallback sentence is exact and cites Dai, Dai & Zhou without a specific percentage", () => {
  assert.equal(isGrainAsset("WHEAT"), true);
  assert.equal(isGrainAsset("CORN"), true);
  assert.equal(isGrainAsset("USOIL"), false);
  assert.equal(
    GRAIN_FALLBACK_SENTENCE,
    "Geopolitical risk has been shown to raise long-run volatility in wheat, corn, soybean, and rice futures (Dai, Dai & Zhou, 2025, Journal of Futures Markets).",
  );
  assert.equal(/%/.test(GRAIN_FALLBACK_SENTENCE), false);
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
