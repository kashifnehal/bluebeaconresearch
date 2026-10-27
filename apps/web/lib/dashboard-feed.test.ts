import assert from "node:assert/strict";
import type { Signal } from "@blue-beacon-research/shared";
import { DEFAULT_FILTERS } from "@/lib/signal-filters";
import { buildActiveFilterChips, sortStreamList } from "./dashboard-feed";

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

function sig(overrides: Partial<Signal>): Signal {
  return {
    id: "sig",
    title: "t",
    summary: "s",
    severity: 5,
    confidence: 0.5,
    eventType: "conflict",
    country: "Yemen",
    region: "middle-east",
    sourcesCount: 1,
    commodityImpacts: [],
    currencyPairImpacts: [],
    isBreaking: false,
    isActive: true,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  } as Signal;
}

runTest("sortStreamList: 'relevance' returns the same array reference order (server order kept)", () => {
  const list = [sig({ id: "a" }), sig({ id: "b" })];
  assert.deepEqual(sortStreamList(list, "relevance"), list);
});

runTest("sortStreamList: 'newest' sorts by eventDate (falling back to createdAt) descending, ties by id", () => {
  const list = [
    sig({ id: "old", createdAt: "2026-10-01T00:00:00.000Z" }),
    sig({ id: "new", createdAt: "2026-10-05T00:00:00.000Z" }),
    sig({ id: "tie-b", createdAt: "2026-10-03T00:00:00.000Z" }),
    sig({ id: "tie-a", createdAt: "2026-10-03T00:00:00.000Z" }),
  ];
  const sorted = sortStreamList(list, "newest").map((s) => s.id);
  assert.deepEqual(sorted, ["new", "tie-a", "tie-b", "old"]);
});

runTest("sortStreamList: 'newest' prefers eventDate over createdAt when present", () => {
  const list = [
    sig({ id: "a", createdAt: "2026-10-01T00:00:00.000Z", eventDate: "2026-10-10T00:00:00.000Z" }),
    sig({ id: "b", createdAt: "2026-10-09T00:00:00.000Z" }),
  ];
  assert.deepEqual(sortStreamList(list, "newest").map((s) => s.id), ["a", "b"]);
});

runTest("sortStreamList: 'severity' sorts high to low, ties broken by date descending", () => {
  const list = [
    sig({ id: "low", severity: 3 }),
    sig({ id: "high", severity: 9 }),
    sig({ id: "tie-newer", severity: 6, createdAt: "2026-10-05T00:00:00.000Z" }),
    sig({ id: "tie-older", severity: 6, createdAt: "2026-10-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(sortStreamList(list, "severity").map((s) => s.id), [
    "high",
    "tie-newer",
    "tie-older",
    "low",
  ]);
});

runTest("sortStreamList never mutates the input array for newest/severity", () => {
  const list = [sig({ id: "a", severity: 1 }), sig({ id: "b", severity: 9 })];
  const copy = [...list];
  sortStreamList(list, "severity");
  assert.deepEqual(list, copy);
});

runTest("buildActiveFilterChips: no chips for the exact defaults", () => {
  assert.deepEqual(buildActiveFilterChips(DEFAULT_FILTERS), []);
});

runTest("buildActiveFilterChips: a single commodity symbol gets its display label", () => {
  const chips = buildActiveFilterChips({ ...DEFAULT_FILTERS, commodity: "USOIL" });
  assert.deepEqual(chips, [{ id: "commodity", label: "WTI Crude" }]);
});

runTest("buildActiveFilterChips: a commodity category gets the category label", () => {
  const chips = buildActiveFilterChips({ ...DEFAULT_FILTERS, commodity: "cat:energy" });
  assert.deepEqual(chips, [{ id: "commodity", label: "Energy" }]);
});

runTest("buildActiveFilterChips: region gets its canonical display label", () => {
  const chips = buildActiveFilterChips({ ...DEFAULT_FILTERS, region: "middle-east" });
  assert.deepEqual(chips, [{ id: "region", label: "Middle East" }]);
});

runTest("buildActiveFilterChips: severity above the default-4 floor gets a chip; at the floor it does not", () => {
  assert.deepEqual(buildActiveFilterChips({ ...DEFAULT_FILTERS, minSeverity: 7 }), [
    { id: "minSeverity", label: "Severity ≥ 7" },
  ]);
  assert.deepEqual(buildActiveFilterChips({ ...DEFAULT_FILTERS, minSeverity: 4 }), []);
});

runTest("buildActiveFilterChips: minSources above 1 gets a Reports chip", () => {
  assert.deepEqual(buildActiveFilterChips({ ...DEFAULT_FILTERS, minSources: 3 }), [
    { id: "minSources", label: "Reports ≥ 3" },
  ]);
});

runTest("buildActiveFilterChips: an explicit time window gets its dropdown label", () => {
  assert.deepEqual(buildActiveFilterChips({ ...DEFAULT_FILTERS, window: "24h" }), [
    { id: "window", label: "Today" },
  ]);
});

runTest("buildActiveFilterChips: event category gets the same chip label CategoryChips shows", () => {
  assert.deepEqual(
    buildActiveFilterChips({ ...DEFAULT_FILTERS, eventCategory: "armed_conflict_security" }),
    [{ id: "eventCategory", label: "Conflict & security" }],
  );
  assert.deepEqual(buildActiveFilterChips({ ...DEFAULT_FILTERS, eventCategory: "uncategorized" }), [
    { id: "eventCategory", label: "Uncategorized" },
  ]);
});

runTest("buildActiveFilterChips: multiple active fields each get their own chip, in field order", () => {
  const chips = buildActiveFilterChips({
    commodity: "USOIL",
    region: "middle-east",
    minSeverity: 7,
    window: "7d",
    minSources: 2,
    eventCategory: "sanctions_trade_policy",
  });
  assert.deepEqual(chips.map((c) => c.id), [
    "commodity",
    "region",
    "minSeverity",
    "minSources",
    "window",
    "eventCategory",
  ]);
});
