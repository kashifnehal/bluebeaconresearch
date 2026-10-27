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

type CalendarEvent = { id: string; date: string; time: string | null; category: string };
type CalendarFile = { events: CalendarEvent[] };

runTest("every backend calendar event id exists in the web file with the same date and time", () => {
  const backendPath = resolve(__dirname, "../data/economic-calendar.json");
  // Read the web copy from disk directly — no runtime import — so this test
  // file creates no module dependency from apps/backend onto apps/web.
  const webPath = resolve(__dirname, "../../../web/data/economic-calendar.json");
  const backendData = JSON.parse(readFileSync(backendPath, "utf8")) as CalendarFile;
  const webData = JSON.parse(readFileSync(webPath, "utf8")) as CalendarFile;

  assert.ok(backendData.events.length > 0, "backend copy should not be empty");
  const webById = new Map(webData.events.map((e) => [e.id, e]));
  for (const ev of backendData.events) {
    const match = webById.get(ev.id);
    assert.ok(match, `backend event ${ev.id} is missing from the web calendar`);
    assert.equal(match!.date, ev.date, `date mismatch for ${ev.id}`);
    assert.equal(match!.time, ev.time, `time mismatch for ${ev.id}`);
  }
  // The web file may have extra rows the backend copy doesn't (yet) carry.
  assert.ok(webData.events.length >= backendData.events.length);
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

runTest("weeklyRhythmLines returns the five fixed recurring lines", () => {
  const lines = weeklyRhythmLines();
  assert.equal(lines.length, 5);
  assert.ok(lines.some((l) => /EIA Weekly Petroleum Status Report/.test(l)));
  assert.ok(lines.some((l) => /EIA Weekly Natural Gas Storage Report/.test(l)));
  assert.ok(lines.some((l) => /Commitments of Traders/.test(l)));
  assert.ok(lines.some((l) => /Baker Hughes/.test(l)));
});

if (failed) process.exit(1);
