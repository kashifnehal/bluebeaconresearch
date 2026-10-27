import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { weekAheadFor, weeklyRhythmLines, CATEGORY_ASSET_MAP, __resetWeekAheadCacheForTests } = await import(
  "./week-ahead.js"
);

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

type CalendarEvent = {
  id: string;
  date: string;
  time: string | null;
  status?: string;
  sourceUrl: string;
};
type CalendarFile = { events: CalendarEvent[] };

const COPY_MESSAGE =
  "Copy apps/web/data/economic-calendar.json to apps/backend/src/data/economic-calendar.json";

runTest("backend calendar copy is identical to the web copy", () => {
  const backendPath = resolve(__dirname, "../data/economic-calendar.json");
  // Read the web copy from disk directly — no runtime import — so this test
  // file creates no module dependency from apps/backend onto apps/web.
  const webPath = resolve(__dirname, "../../../web/data/economic-calendar.json");
  const backendData = JSON.parse(readFileSync(backendPath, "utf8")) as CalendarFile;
  const webData = JSON.parse(readFileSync(webPath, "utf8")) as CalendarFile;

  assert.ok(backendData.events.length > 0, "backend copy should not be empty");
  assert.equal(backendData.events.length, webData.events.length, COPY_MESSAGE);

  const webById = new Map(webData.events.map((e) => [e.id, e]));
  for (const ev of backendData.events) {
    const match = webById.get(ev.id);
    assert.ok(match, `${COPY_MESSAGE} (missing: ${ev.id})`);
    assert.equal(match!.date, ev.date, `${COPY_MESSAGE} (date mismatch: ${ev.id})`);
    assert.equal(match!.time, ev.time, `${COPY_MESSAGE} (time mismatch: ${ev.id})`);
    assert.equal(match!.status, ev.status, `${COPY_MESSAGE} (status mismatch: ${ev.id})`);
    assert.equal(match!.sourceUrl, ev.sourceUrl, `${COPY_MESSAGE} (sourceUrl mismatch: ${ev.id})`);
  }
});

runTest("CATEGORY_ASSET_MAP matches apps/web/lib/calendar-filters.ts's mapping", () => {
  const webLibPath = resolve(__dirname, "../../../web/lib/calendar-filters.ts");
  const source = readFileSync(webLibPath, "utf8");
  const mapMatch = source.match(/CATEGORY_ASSET_MAP[^{]*\{([^}]*)\}/);
  assert.ok(mapMatch, "could not find CATEGORY_ASSET_MAP in calendar-filters.ts");

  const webMap: Record<string, string[]> = {};
  const entryRe = /(\w+):\s*\[([^\]]*)\]/g;
  let entry: RegExpExecArray | null;
  while ((entry = entryRe.exec(mapMatch![1])) !== null) {
    const assets = entry[2]
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
    webMap[entry[1]] = assets;
  }

  assert.ok(Object.keys(webMap).length > 0, "parsed zero entries out of calendar-filters.ts's mapping");
  assert.deepEqual(CATEGORY_ASSET_MAP, webMap);
});

runTest("weekAheadFor keeps only mapped-category events matching the user's commodities, plus every macro event", () => {
  __resetWeekAheadCacheForTests();
  const now = new Date("2026-11-02T06:00:00.000Z"); // a date inside the fixture's EIA window
  const withUsoil = weekAheadFor(["USOIL"], now);
  const withNothing = weekAheadFor([], now);

  // Every Energy-mapped event in the USOIL-filtered result must include USOIL.
  for (const ev of withUsoil) {
    if (ev.assets !== "all") assert.ok(ev.assets.includes("USOIL"));
  }
  // An unmapped (macro) event appears regardless of the commodities filter.
  const macroInBoth =
    withUsoil.some((e) => e.assets === "all") === withNothing.some((e) => e.assets === "all");
  assert.ok(macroInBoth || withUsoil.length === 0, "macro events should not depend on the commodities filter");
  // No event in the window is more than 7 days after `now`'s UTC calendar day.
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = start + 7 * 24 * 60 * 60 * 1000;
  for (const ev of withUsoil) {
    const ms = Date.parse(`${ev.date}T00:00:00Z`);
    assert.ok(ms >= start && ms <= end, `${ev.date} is outside the 7-day window`);
  }
});

runTest('weekAheadFor on 2026-11-02 includes the NFP release but not the later CPI release', () => {
  __resetWeekAheadCacheForTests();
  const result = weekAheadFor(["USOIL"], new Date("2026-11-02T06:00:00Z"));
  const nfp = result.find((ev) => ev.event.toLowerCase().includes("employment situation") || ev.date === "2026-11-06");
  assert.ok(nfp, "expected the Nov 6 NFP release to be in the 7-day window");
  assert.equal(nfp!.assets, "all", "an unmapped macro event is labelled \"All markets\" (assets === \"all\")");
  const cpi = result.find((ev) => ev.date === "2026-11-10");
  assert.equal(cpi, undefined, "the Nov 10 CPI release is outside the 7-day window from Nov 2");
});

runTest("weekAheadFor on 2026-11-03 includes both the NFP and the CPI release", () => {
  __resetWeekAheadCacheForTests();
  const result = weekAheadFor(["USOIL"], new Date("2026-11-03T06:00:00Z"));
  assert.ok(result.some((ev) => ev.date === "2026-11-06"), "expected the Nov 6 NFP release in the window");
  assert.ok(result.some((ev) => ev.date === "2026-11-10"), "expected the Nov 10 CPI release in the window");
});

runTest("weeklyRhythmLines returns the five fixed recurring lines", () => {
  const lines = weeklyRhythmLines();
  assert.equal(lines.length, 5);
  assert.ok(lines.some((l) => /EIA Weekly Petroleum Status Report/.test(l)));
  assert.ok(lines.some((l) => /EIA Weekly Natural Gas Storage Report/.test(l)));
  assert.ok(lines.some((l) => /Commitments of Traders/.test(l)));
  assert.ok(lines.some((l) => /Baker Hughes/.test(l)));
});

if (failed) process.exit(1);
