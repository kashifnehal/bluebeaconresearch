import assert from "node:assert/strict";
import { groupStoryThreads, sameStory, titleWords, type ThreadableSignal } from "./story-threads";

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

const base = Date.parse("2026-10-17T12:00:00Z");
const h = (hours: number) => new Date(base - hours * 3600_000).toISOString();
const oil = [{ asset: "USOIL", direction: "up", confidence: 0.6 }];

function sig(over: Record<string, unknown> & { id: string }): ThreadableSignal {
  return {
    title: "Trump announces new Russia sanctions on oil exports",
    createdAt: h(0),
    severity: 6,
    sourcesCount: 1,
    eventCategory: "sanctions_trade_policy",
    commodityImpacts: oil,
    ...over,
  } as unknown as ThreadableSignal;
}

runTest("titleWords lowercases, strips punctuation, drops short words, removes one trailing s", () => {
  const w = titleWords("Russia's Oil-Exports: SANCTIONS, new!");
  assert.deepEqual([...w].sort(), ["export", "russia", "sanction"]);
});

runTest("titleWords handles empty input", () => {
  assert.equal(titleWords(null).size, 0);
});

runTest("sameStory links rows meeting every condition", () => {
  const b = sig({ id: "b", title: "Russia sanctions on oil exports widen", createdAt: h(5) });
  assert.equal(sameStory(sig({ id: "a" }), b), true);
});

runTest("sameStory rejects rows more than 24h apart", () => {
  assert.equal(sameStory(sig({ id: "a" }), sig({ id: "b", createdAt: h(25) })), false);
});

runTest("sameStory rejects different or missing categories", () => {
  assert.equal(sameStory(sig({ id: "a" }), sig({ id: "b", eventCategory: "armed_conflict_security" })), false);
  assert.equal(
    sameStory(sig({ id: "a", eventCategory: null }), sig({ id: "b", eventCategory: null })),
    false,
  );
});

runTest("sameStory rejects rows with no shared symbol", () => {
  const gold = [{ asset: "GOLD", direction: "up", confidence: 0.5 }];
  assert.equal(sameStory(sig({ id: "a" }), sig({ id: "b", commodityImpacts: gold })), false);
});

runTest("sameStory uses 2 shared words OR a 0.4 word-set overlap", () => {
  // 2 shared words
  assert.equal(
    sameStory(sig({ id: "a", title: "Hormuz tanker attack" }), sig({ id: "b", title: "Hormuz tanker" })),
    true,
  );
  // 1 shared word, union 3 -> 0.33: not linked
  assert.equal(
    sameStory(sig({ id: "c", title: "Opec cuts" }), sig({ id: "d", title: "Opec holds" })),
    false,
  );
  // 1 shared word, union 2 -> 0.5: linked
  assert.equal(
    sameStory(sig({ id: "e", title: "Opec meeting" }), sig({ id: "f", title: "Opec" })),
    true,
  );
});

runTest("groupStoryThreads returns every row once, leads by severity then newest", () => {
  const wheat = [{ asset: "WHEAT", direction: "down", confidence: 0.5 }];
  const rows = [
    sig({ id: "1", severity: 5, createdAt: h(1) }),
    sig({
      id: "2",
      title: "Unrelated grain harvest outlook",
      eventCategory: "other_market_relevant",
      commodityImpacts: wheat,
    }),
    sig({ id: "3", severity: 8, createdAt: h(2), sourcesCount: 3 }),
    sig({ id: "4", severity: 8, createdAt: h(0.5), sourcesCount: 2 }),
  ];
  const items = groupStoryThreads(rows);
  assert.equal(items.length, 2);
  assert.equal(items[0].kind, "thread");
  assert.deepEqual(items[1], { kind: "single", signal: rows[1] });
  if (items[0].kind !== "thread") throw new Error("expected thread");
  const t = items[0].thread;
  assert.deepEqual(
    t.members.map((m) => m.id),
    ["4", "1", "3"],
  );
  assert.equal(t.lead.id, "4");
  assert.equal(t.totalReports, 6);
  assert.deepEqual(t.markets, ["USOIL"]);
  assert.equal(t.newestAt, rows[3].createdAt);
});

runTest("groupStoryThreads joins chains of single links into one thread", () => {
  const a = sig({ id: "a", title: "Alpha bravo charlie delta", createdAt: h(0) });
  const b = sig({ id: "b", title: "Alpha bravo echo foxtrot", createdAt: h(10) });
  const c = sig({ id: "c", title: "Echo foxtrot golf hotel", createdAt: h(20) });
  const items = groupStoryThreads([a, b, c]);
  assert.equal(items.length, 1);
  assert.equal(items[0].kind === "thread" ? items[0].thread.members.length : 0, 3);
});

runTest("groupStoryThreads unions markets and handles empty input", () => {
  const a = sig({
    id: "a",
    commodityImpacts: [
      { asset: "USOIL", direction: "up", confidence: 0.5 },
      { asset: "NGAS", direction: "up", confidence: 0.5 },
    ],
  });
  const b = sig({
    id: "b",
    commodityImpacts: [
      { asset: "USOIL", direction: "down", confidence: 0.5 },
      { asset: "GOLD", direction: "up", confidence: 0.5 },
    ],
  });
  const items = groupStoryThreads([a, b]);
  assert.deepEqual(items[0].kind === "thread" ? items[0].thread.markets : [], ["USOIL", "NGAS", "GOLD"]);
  assert.deepEqual(groupStoryThreads([]), []);
});
