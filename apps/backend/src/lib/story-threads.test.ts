import assert from "node:assert/strict";

import {
  buildStoryThreads,
  pairBelongsTogether,
  titleWordSet,
  type ThreadSignal,
} from "./story-threads.js";

const SAME = {
  event_category: "sanctions_trade_policy",
  symbols: ["USOIL"],
  created_at: "2026-10-17T12:00:00.000Z",
};

function sig(id: string, title: string, extra: Partial<ThreadSignal> = {}): ThreadSignal {
  return { id, title, ...SAME, ...extra };
}

const TRUMP_TITLES = [
  "Trump Waives Russian Oil Sanctions, Offering Relief to India",
  "Trump holds Russia sanctions waiver, citing national interest",
  "Trump delays Russia sanctions, holds Congress-passed measures",
  "Trump delays Russia sanctions, citing national interest",
  "Trump holds Russia sanctions, deepens Ukraine row",
  "Trump delays new Russia sanctions after signing",
] as const;

const OTHER_TITLES = [
  "Qatar Gas Exports Halted by Iran War; Revenue Plunges 42%",
  "Saudi Air Defenses Reportedly Failing Against Houthi Missiles",
] as const;

let failed = false;
function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

runTest("titleWordSet lowercases, strips punctuation, drops short words, trims a trailing s", () => {
  const words = titleWordSet("Trump Waives Russian Oil Sanctions, Offering Relief to India");
  assert.equal(words.has("trump"), true);
  assert.equal(words.has("waive"), true);
  assert.equal(words.has("russian"), true);
  assert.equal(words.has("sanction"), true);
  assert.equal(words.has("oil"), false);
  assert.equal(words.has("to"), false);
  assert.equal(words.has("sanctions"), false);
});

runTest("the six Russia-sanctions titles form one thread when category and symbols match", () => {
  const signals = TRUMP_TITLES.map((title, i) => sig(`t${i}`, title));
  const threads = buildStoryThreads(signals);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].length, 6);
});

runTest("the Qatar and Saudi titles do not join the Russia-sanctions thread", () => {
  const signals = [
    ...TRUMP_TITLES.map((title, i) => sig(`t${i}`, title)),
    ...OTHER_TITLES.map((title, i) => sig(`o${i}`, title)),
  ];
  const threads = buildStoryThreads(signals);
  const byId = new Map(threads.map((thread) => [thread.map((s) => s.id).sort().join(","), thread]));
  const trump = threads.find((thread) => thread.some((s) => s.id === "t0"));
  assert.ok(trump);
  assert.equal(trump.length, 6);
  assert.equal(trump.every((s) => s.id.startsWith("t")), true);
  const qatar = threads.find((thread) => thread.some((s) => s.id === "o0"));
  const saudi = threads.find((thread) => thread.some((s) => s.id === "o1"));
  assert.ok(qatar);
  assert.ok(saudi);
  assert.equal(qatar.length, 1);
  assert.equal(saudi.length, 1);
  assert.notEqual(qatar, trump);
  assert.notEqual(saudi, trump);
  void byId;
});

runTest("pairBelongsTogether requires the same category, a shared symbol, and 24h proximity", () => {
  const a = sig("a", TRUMP_TITLES[0]);
  const b = sig("b", TRUMP_TITLES[1]);
  assert.equal(pairBelongsTogether(a, b), true);
  assert.equal(pairBelongsTogether(a, { ...b, event_category: "armed_conflict_security" }), false);
  assert.equal(pairBelongsTogether(a, { ...b, symbols: ["NGAS"] }), false);
  assert.equal(
    pairBelongsTogether(a, { ...b, created_at: "2026-10-19T12:00:00.000Z" }),
    false,
  );
});

if (failed) process.exit(1);
