import assert from "node:assert/strict";
import {
  buildEventSources,
  computeFirstReportInfo,
  earliestRawStamp,
  kindForRawSource,
  seendateToIso,
  validIso,
} from "./event-sources";

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

runTest("validIso accepts a real ISO string and rejects garbage/empty", () => {
  assert.equal(validIso("2026-11-01T00:00:00.000Z"), "2026-11-01T00:00:00.000Z");
  assert.equal(validIso("not-a-date"), null);
  assert.equal(validIso(""), null);
  assert.equal(validIso(null), null);
  assert.equal(validIso(42), null);
});

runTest("seendateToIso converts GDELT's compact seendate format", () => {
  assert.equal(seendateToIso("20260905T160000Z"), "2026-09-05T16:00:00Z");
  assert.equal(seendateToIso("too-short"), null);
  assert.equal(seendateToIso(123), null);
});

runTest("kindForRawSource maps rss/newsapi to publisher, gdelt to gdelt_seen, else null", () => {
  assert.equal(kindForRawSource("rss"), "publisher");
  assert.equal(kindForRawSource("newsapi"), "publisher");
  assert.equal(kindForRawSource("gdelt"), "gdelt_seen");
  assert.equal(kindForRawSource("other"), null);
  assert.equal(kindForRawSource(null), null);
});

runTest("earliestRawStamp picks the row with the smallest valid timestamp", () => {
  const rows = [
    { event_date: "2026-11-02T00:00:00Z", source: "gdelt" },
    { event_date: "2026-11-01T00:00:00Z", source: "rss" },
    { event_date: "not-a-date", source: "newsapi" },
  ];
  const best = earliestRawStamp(rows, "event_date");
  assert.deepEqual(best, { at: "2026-11-01T00:00:00Z", source: "rss" });
});

runTest("earliestRawStamp returns null when no row has a valid stamp", () => {
  assert.equal(earliestRawStamp([{ event_date: null }], "event_date"), null);
  assert.equal(earliestRawStamp([], "event_date"), null);
});

runTest("buildEventSources sorts oldest-first and resolves domain/title/url fallbacks", () => {
  const sources = buildEventSources([
    {
      title: "Later story",
      event_date: "2026-11-02T00:00:00Z",
      raw_data: { url: "https://reuters.com/a", source: "Reuters" },
    },
    {
      title: null as any,
      event_date: "2026-11-01T00:00:00Z",
      raw_data: { url: "https://apnews.com/b" },
    },
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, "Untitled source");
  assert.equal(sources[0].domain, "apnews.com");
  assert.equal(sources[1].title, "Later story");
  assert.equal(sources[1].domain, "reuters.com");
});

runTest("buildEventSources sorts entries with no resolvable date last", () => {
  const sources = buildEventSources([
    { title: "No date", raw_data: {} },
    { title: "Dated", event_date: "2026-11-01T00:00:00Z", raw_data: {} },
  ]);
  assert.equal(sources[0].title, "Dated");
  assert.equal(sources[1].title, "No date");
});

runTest("computeFirstReportInfo falls back to the signal's own event_date when no raw rows resolve", () => {
  const info = computeFirstReportInfo([], "2026-11-01T00:00:00Z");
  assert.equal(info.firstReportAt, "2026-11-01T00:00:00Z");
  assert.equal(info.firstReportKind, null);
  assert.equal(info.firstFetchedAt, null);
});

runTest("computeFirstReportInfo prefers the earliest raw row's stamp and kind", () => {
  const info = computeFirstReportInfo(
    [
      { event_date: "2026-11-02T00:00:00Z", created_at: "2026-11-02T01:00:00Z", source: "gdelt" },
      { event_date: "2026-11-01T00:00:00Z", created_at: "2026-11-01T01:00:00Z", source: "rss" },
    ],
    "2026-10-30T00:00:00Z",
  );
  assert.equal(info.firstReportAt, "2026-11-01T00:00:00Z");
  assert.equal(info.firstReportKind, "publisher");
  assert.equal(info.firstFetchedAt, "2026-11-01T01:00:00Z");
});
