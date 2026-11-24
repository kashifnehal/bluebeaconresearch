// TASK NQW3-FILTER1 Part 9 — tests for the calendar/title matching and the
// minutes-from-release calculation, all with fixed data (no database, no
// real economic-calendar.json read for the matching-logic tests).
import assert from "node:assert/strict";
import {
  calendarEventIso,
  hasStoredSchedule,
  scheduledInstancesInWindow,
  titleMatchesRelease,
  earliestMatchInWindow,
  minutesFromRelease,
  renderReleaseCoverageMarkdown,
  parseReleaseCoverageArgs,
  RELEASE_FOMC,
  RELEASE_ECB,
  RELEASE_BOE,
  RELEASE_PPI,
  RELEASE_EIA_WEEKLY,
  type CalendarEvent,
  type TitledRow,
} from "./release-coverage.js";

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

// ── calendarEventIso ──────────────────────────────────────────────────

runTest("calendarEventIso combines date+time as UTC; null time defaults to 00:00Z", () => {
  assert.equal(calendarEventIso({ date: "2026-11-05", time: "12:00" }), "2026-11-05T12:00:00Z");
  assert.equal(calendarEventIso({ date: "2026-12-04", time: null }), "2026-12-04T00:00:00Z");
});

runTest("calendarEventIso returns null for a missing/unparseable date", () => {
  assert.equal(calendarEventIso({ date: "", time: "12:00" }), null);
  assert.equal(calendarEventIso({ date: "not-a-date", time: "12:00" }), null);
});

// ── hasStoredSchedule / scheduledInstancesInWindow ────────────────────

const FIXTURE_EVENTS: CalendarEvent[] = [
  { id: "1", date: "2026-10-28", time: "18:00", event: "FOMC Interest Rate Decision" },
  { id: "2", date: "2026-11-10", time: "12:15", event: "ECB Governing Council Rate Decision" },
  { id: "3", date: "2026-12-09", time: "19:00", event: "FOMC Interest Rate Decision" },
  { id: "4", date: "2026-11-12", time: "15:30", event: "EIA Weekly Petroleum Status Report" },
];

runTest("hasStoredSchedule: true for a release with at least one matching row, false for one with none (BoE/PPI)", () => {
  assert.equal(hasStoredSchedule(RELEASE_FOMC, FIXTURE_EVENTS), true);
  assert.equal(hasStoredSchedule(RELEASE_ECB, FIXTURE_EVENTS), true);
  assert.equal(hasStoredSchedule(RELEASE_BOE, FIXTURE_EVENTS), false);
  assert.equal(hasStoredSchedule(RELEASE_PPI, FIXTURE_EVENTS), false);
});

runTest("scheduledInstancesInWindow: only returns instances within [since, now], sorted earliest-first", () => {
  const instances = scheduledInstancesInWindow(
    RELEASE_FOMC,
    FIXTURE_EVENTS,
    "2026-10-01T00:00:00Z",
    "2026-11-30T00:00:00Z",
  );
  assert.equal(instances.length, 1, "only the Oct 28 FOMC row is inside the window; Dec 9 is outside it");
  assert.equal(instances[0].scheduledAtIso, "2026-10-28T18:00:00Z");
});

runTest("scheduledInstancesInWindow: empty array when nothing matches (BoE has no rows at all)", () => {
  const instances = scheduledInstancesInWindow(
    RELEASE_BOE,
    FIXTURE_EVENTS,
    "2026-10-01T00:00:00Z",
    "2026-11-30T00:00:00Z",
  );
  assert.deepEqual(instances, []);
});

runTest("scheduledInstancesInWindow: sorts multiple matches earliest-first", () => {
  const instances = scheduledInstancesInWindow(
    RELEASE_EIA_WEEKLY,
    [
      { id: "a", date: "2026-11-18", time: "15:30", event: "EIA Weekly Petroleum Status Report" },
      { id: "b", date: "2026-11-04", time: "15:30", event: "EIA Weekly Petroleum Status Report" },
      { id: "c", date: "2026-11-11", time: "17:00", event: "EIA Weekly Petroleum Status Report" },
    ],
    "2026-11-01T00:00:00Z",
    "2026-11-30T00:00:00Z",
  );
  assert.deepEqual(instances.map((i) => i.scheduledAtIso), [
    "2026-11-04T15:30:00Z",
    "2026-11-11T17:00:00Z",
    "2026-11-18T15:30:00Z",
  ]);
});

// ── titleMatchesRelease / earliestMatchInWindow / minutesFromRelease ──

runTest("titleMatchesRelease: case-insensitive substring match against titleKeywords", () => {
  assert.equal(titleMatchesRelease("Fed holds rates steady after FOMC meeting", RELEASE_FOMC), true);
  assert.equal(titleMatchesRelease("fomc minutes released", RELEASE_FOMC), true);
  assert.equal(titleMatchesRelease("ECB raises rates", RELEASE_FOMC), false);
  assert.equal(titleMatchesRelease(null, RELEASE_FOMC), false);
});

const FIXTURE_ROWS: TitledRow[] = [
  { title: "FOMC holds rates steady", created_at: "2026-10-28T18:40:00Z" }, // 40 min after
  { title: "Fed officials comment on outlook", created_at: "2026-10-29T10:00:00Z" }, // later, same window
  { title: "Unrelated oil tanker story", created_at: "2026-10-28T19:00:00Z" },
  { title: "FOMC decision too late", created_at: "2026-10-31T00:00:00Z" }, // outside 48h window
];

runTest("earliestMatchInWindow: picks the earliest matching row inside the window, ignores non-matching and out-of-window rows", () => {
  const match = earliestMatchInWindow(FIXTURE_ROWS, RELEASE_FOMC, "2026-10-28T18:00:00Z");
  assert.ok(match);
  assert.equal(match!.created_at, "2026-10-28T18:40:00Z");
});

runTest("earliestMatchInWindow: null when nothing matches inside the window", () => {
  const match = earliestMatchInWindow(FIXTURE_ROWS, RELEASE_FOMC, "2026-11-20T00:00:00Z");
  assert.equal(match, null);
});

runTest("earliestMatchInWindow: a row before the scheduled time never counts, even if the title matches", () => {
  const rows: TitledRow[] = [{ title: "FOMC preview", created_at: "2026-10-28T17:59:00Z" }];
  assert.equal(earliestMatchInWindow(rows, RELEASE_FOMC, "2026-10-28T18:00:00Z"), null);
});

runTest("minutesFromRelease: whole minutes from the scheduled instant to the row", () => {
  assert.equal(minutesFromRelease("2026-10-28T18:00:00Z", { title: "x", created_at: "2026-10-28T18:40:00Z" }), 40);
  assert.equal(minutesFromRelease("2026-09-15T12:30:00Z", { title: "x", created_at: "2026-09-16T00:04:00Z" }), 694);
});

// ── parseReleaseCoverageArgs ───────────────────────────────────────────

runTest("parseReleaseCoverageArgs: defaults to 30 days before `now`; --since overrides", () => {
  const now = new Date("2026-11-24T00:00:00.000Z");
  assert.equal(
    parseReleaseCoverageArgs([], now).sinceIso,
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  );
  assert.equal(parseReleaseCoverageArgs(["--since", "2026-10-01"]).sinceIso, new Date("2026-10-01").toISOString());
  assert.equal(parseReleaseCoverageArgs(["--since=2026-10-01"]).sinceIso, new Date("2026-10-01").toISOString());
});

// ── renderReleaseCoverageMarkdown ──────────────────────────────────────

runTest("renderReleaseCoverageMarkdown: a release with no stored schedule at all (BoE/PPI) says so explicitly, not silently omitted", () => {
  const md = renderReleaseCoverageMarkdown(
    [
      {
        release: "Bank of England (BoE)",
        scheduledAtIso: null,
        scheduledLabel: null,
        firstRawEventIso: null,
        firstSignalIso: null,
        minutesToRaw: null,
        minutesToSignal: null,
        note: "not in stored calendar data (no BoE/PPI rows in economic-calendar.json)",
      },
    ],
    "2026-11-24T00:00:00Z",
    "2026-10-25T00:00:00Z",
  );
  assert.match(md, /Bank of England \(BoE\)/);
  assert.match(md, /not in stored calendar data/);
});

runTest("renderReleaseCoverageMarkdown: a real row prints the scheduled time and both minutes columns", () => {
  const md = renderReleaseCoverageMarkdown(
    [
      {
        release: "Federal Reserve (FOMC)",
        scheduledAtIso: "2026-10-28T18:00:00Z",
        scheduledLabel: "FOMC Interest Rate Decision",
        firstRawEventIso: "2026-10-28T18:40:00Z",
        firstSignalIso: "2026-10-28T19:10:00Z",
        minutesToRaw: 40,
        minutesToSignal: 70,
        note: null,
      },
    ],
    "2026-11-24T00:00:00Z",
    "2026-10-25T00:00:00Z",
  );
  assert.match(md, /2026-10-28T18:00:00Z/);
  assert.match(md, /\| 40 \|/);
  assert.match(md, /\| 70 \|/);
});

if (failed) process.exit(1);
