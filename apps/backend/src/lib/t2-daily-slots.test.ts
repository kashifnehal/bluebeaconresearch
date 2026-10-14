import assert from "node:assert/strict";
import { dropReason, isRelevantEvent, keptOnlyByT2Pair, type FeedTier } from "./relevance-filter.js";
import { consumeT2Slot, t2SlotsLeft } from "./t2-daily-slots.js";
import { buildDropRecord } from "../workers/drop-sample-store.js";

const savedRule = process.env.T2_PAIR_RULE;
const savedMax = process.env.T2_PAIR_DAILY_MAX;

function restoreEnv(): void {
  if (savedRule === undefined) delete process.env.T2_PAIR_RULE;
  else process.env.T2_PAIR_RULE = savedRule;
  if (savedMax === undefined) delete process.env.T2_PAIR_DAILY_MAX;
  else process.env.T2_PAIR_DAILY_MAX = savedMax;
}

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

/** Same order as the collectors: slot check, relevance, then consume only a pair-only keep. */
function applyRelevance(title: string, summary: string, tier: FeedTier, now: Date): boolean {
  const allowed = t2SlotsLeft(now) > 0;
  const kept = isRelevantEvent(title, summary, tier, { t2PairAllowed: allowed });
  if (kept && keptOnlyByT2Pair(title, summary, tier)) consumeT2Slot(now);
  return kept;
}

const PAIR_ONLY = "India extends sugar export ban through September";
const OIL = "Oil output rises to 12000 barrels per day at Libyan field";
const PALM = "Indonesia raises palm oil export levy to fund biodiesel";

runTest("unset T2_PAIR_DAILY_MAX leaves 20 slots", () => {
  delete process.env.T2_PAIR_DAILY_MAX;
  assert.equal(t2SlotsLeft(new Date("2026-05-01T12:00:00.000Z")), 20);
});

runTest("the limit is reached after T2_PAIR_DAILY_MAX pair-only keeps, then the same headline is dropped", () => {
  process.env.T2_PAIR_DAILY_MAX = "3";
  const now = new Date("2026-05-02T12:00:00.000Z");
  delete process.env.T2_PAIR_RULE;
  assert.equal(isRelevantEvent(PAIR_ONLY), false, "flag-off baseline is a drop");
  process.env.T2_PAIR_RULE = "true";
  assert.equal(keptOnlyByT2Pair(PAIR_ONLY), true, "fixture must be pair-only");
  for (let i = 0; i < 3; i++) {
    assert.equal(applyRelevance(PAIR_ONLY, "", "world", now), true, `keep ${i + 1}`);
  }
  assert.equal(t2SlotsLeft(now), 0);
  assert.equal(applyRelevance(PAIR_ONLY, "", "world", now), false);
  assert.equal(dropReason(PAIR_ONLY, "", "world", { t2PairAllowed: false }), "nokeyword");
  const recorded = buildDropRecord("gnews", "world", PAIR_ONLY, "", "https://example.com/sugar-ban");
  assert.equal(recorded.reason, "nokeyword");
  assert.ok(recorded.shadowGroups?.includes("t2-commodity"));
  assert.ok(recorded.shadowGroups?.includes("t2-event"));
  assert.equal(applyRelevance(OIL, "", "world", now), true, "old asset still kept at the cap");
  assert.equal(t2SlotsLeft(now), 0, "old-asset keep does not use a slot");
});

runTest("a new UTC day resets the counter", () => {
  process.env.T2_PAIR_RULE = "true";
  process.env.T2_PAIR_DAILY_MAX = "2";
  const morning = new Date("2026-05-03T00:30:00.000Z");
  const evening = new Date("2026-05-03T23:30:00.000Z");
  const nextDay = new Date("2026-05-04T00:30:00.000Z");
  assert.equal(applyRelevance(PAIR_ONLY, "", "world", morning), true);
  assert.equal(applyRelevance(PAIR_ONLY, "", "world", evening), true);
  assert.equal(t2SlotsLeft(evening), 0);
  assert.equal(applyRelevance(PAIR_ONLY, "", "world", evening), false);
  assert.equal(t2SlotsLeft(nextDay), 2);
  assert.equal(applyRelevance(PAIR_ONLY, "", "world", nextDay), true);
  assert.equal(t2SlotsLeft(nextDay), 1);
});

runTest("T2_PAIR_DAILY_MAX=0 behaves like the flag being off", () => {
  process.env.T2_PAIR_DAILY_MAX = "0";
  process.env.T2_PAIR_RULE = "true";
  const now = new Date("2026-05-05T08:00:00.000Z");
  assert.equal(t2SlotsLeft(now) > 0, false);
  const samples: { title: string; tier: FeedTier }[] = [
    { title: PAIR_ONLY, tier: "world" },
    { title: OIL, tier: "world" },
    { title: "Local bakery announces routine staff appointment", tier: "world" },
    { title: "Local bakery announces routine staff appointment", tier: "finance" },
    { title: "Federal Reserve announces routine staff appointment", tier: "official" },
  ];
  for (const sample of samples) {
    const capped = isRelevantEvent(sample.title, "", sample.tier, { t2PairAllowed: false });
    delete process.env.T2_PAIR_RULE;
    const off = isRelevantEvent(sample.title, "", sample.tier);
    process.env.T2_PAIR_RULE = "true";
    assert.equal(capped, off, `${sample.tier} ${sample.title}`);
    assert.equal(dropReason(sample.title, "", sample.tier, { t2PairAllowed: false }) === null, off, sample.title);
  }
  assert.equal(applyRelevance(PAIR_ONLY, "", "world", now), false);
  process.env.T2_PAIR_DAILY_MAX = "20";
  assert.equal(t2SlotsLeft(now), 20, "max 0 must not consume a slot");
});

runTest("flag off uses no slot", () => {
  delete process.env.T2_PAIR_RULE;
  process.env.T2_PAIR_DAILY_MAX = "20";
  const now = new Date("2026-05-06T12:00:00.000Z");
  assert.equal(t2SlotsLeft(now), 20);
  assert.equal(keptOnlyByT2Pair(PAIR_ONLY), false);
  assert.equal(keptOnlyByT2Pair(PALM), false);
  assert.equal(keptOnlyByT2Pair(OIL), false);
  assert.equal(applyRelevance(PAIR_ONLY, "", "world", now), false);
  assert.equal(applyRelevance(PALM, "", "world", now), true);
  assert.equal(applyRelevance(OIL, "", "world", now), true);
  assert.equal(applyRelevance("Local bakery announces routine staff appointment", "", "finance", now), true);
  assert.equal(t2SlotsLeft(now), 20);
});

runTest("finance and official keeps do not use a slot when the flag is on", () => {
  process.env.T2_PAIR_RULE = "true";
  process.env.T2_PAIR_DAILY_MAX = "5";
  const now = new Date("2026-05-07T12:00:00.000Z");
  assert.equal(applyRelevance("Local bakery announces routine staff appointment", "", "finance", now), true);
  assert.equal(applyRelevance("Federal Reserve announces routine staff appointment", "", "official", now), true);
  assert.equal(keptOnlyByT2Pair("Local bakery announces routine staff appointment", "", "finance"), false);
  assert.equal(t2SlotsLeft(now), 5);
});

restoreEnv();
