import assert from "node:assert/strict";
import {
  buildEventSources,
  computeFirstReportInfo,
  earliestRawStamp,
  kindForRawSource,
  seendateToIso,
  sourceLabelFrom,
  validIso,
  officialSourceCreditLine,
  isGdeltSource,
  formatPublishDate,
  GDELT_CREDIT_TEXT,
  GDELT_PROJECT_URL,
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

runTest("sourceLabelFrom returns a plain string as-is", () => {
  assert.equal(sourceLabelFrom("Reuters"), "Reuters");
  assert.equal(sourceLabelFrom(""), null);
  assert.equal(sourceLabelFrom(null), null);
  assert.equal(sourceLabelFrom(undefined), null);
});

runTest("sourceLabelFrom reads .name off NewsAPI's { id, url, name, country } source object", () => {
  assert.equal(
    sourceLabelFrom({ id: "x", url: "https://manilatimes.net", name: "The Manila Times", country: "ph" }),
    "The Manila Times",
  );
  assert.equal(sourceLabelFrom({ id: "x", url: "https://y.com", country: "us" }), null);
});

runTest("buildEventSources resolves sourceLabel from a NewsAPI source object, not the object itself", () => {
  const sources = buildEventSources([
    {
      title: "Tankers hit mines",
      event_date: "2026-11-14T16:00:00Z",
      raw_data: {
        url: "https://www.manilatimes.net/story",
        source: { id: "x", url: "https://www.manilatimes.net", name: "The Manila Times", country: "ph" },
      },
    },
  ]);
  assert.equal(sources[0].sourceLabel, "The Manila Times");
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

// ── TASK NQW3-FILTER1 Part 8 — official source + GDELT credit lines ──────

runTest("officialSourceCreditLine: an EIA source shows the line with the date", () => {
  const line = officialSourceCreditLine({
    sourceLabel: "EIA Today in Energy",
    publishedAt: "2026-11-20T12:00:00Z",
  });
  assert.equal(line, "Source: U.S. Energy Information Administration (Nov 20, 2026). Summary written by BBR.");
});

runTest("officialSourceCreditLine: all six required publishers resolve to their full names", () => {
  const cases: Array<[string, string]> = [
    ["Federal Reserve", "Board of Governors of the Federal Reserve System"],
    ["EIA Press Releases", "U.S. Energy Information Administration"],
    ["EIA Today in Energy", "U.S. Energy Information Administration"],
    ["ECB", "European Central Bank"],
    ["Bank of Japan", "Bank of Japan"],
    ["Bank of England", "Bank of England"],
  ];
  for (const [label, fullName] of cases) {
    const line = officialSourceCreditLine({ sourceLabel: label, publishedAt: "2026-11-20T00:00:00Z" });
    assert.match(line ?? "", new RegExp(fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
    assert.match(line ?? "", /Summary written by BBR\.$/, label);
  }
});

runTest("officialSourceCreditLine: a non-official source shows no line", () => {
  assert.equal(officialSourceCreditLine({ sourceLabel: "BBC World", publishedAt: "2026-11-20T00:00:00Z" }), null);
  assert.equal(officialSourceCreditLine({ sourceLabel: null, publishedAt: "2026-11-20T00:00:00Z" }), null);
});

runTest("officialSourceCreditLine: no publishedAt omits the parenthetical date instead of printing an empty one", () => {
  const line = officialSourceCreditLine({ sourceLabel: "ECB", publishedAt: null });
  assert.equal(line, "Source: European Central Bank. Summary written by BBR.");
});

runTest("isGdeltSource: true only for collectorSource 'gdelt'", () => {
  assert.equal(isGdeltSource({ collectorSource: "gdelt" }), true);
  assert.equal(isGdeltSource({ collectorSource: "rss" }), false);
  assert.equal(isGdeltSource({ collectorSource: null }), false);
  assert.equal(isGdeltSource({ collectorSource: undefined }), false);
});

runTest("formatPublishDate: formats a UTC date in en-US short-month form, null for anything unparseable", () => {
  assert.equal(formatPublishDate("2026-01-05T00:00:00Z"), "Jan 5, 2026");
  assert.equal(formatPublishDate(null), null);
  assert.equal(formatPublishDate("not-a-date"), null);
});

runTest("GDELT_CREDIT_TEXT and GDELT_PROJECT_URL are the exact required citation and link", () => {
  assert.equal(GDELT_CREDIT_TEXT, "Event data: The GDELT Project");
  assert.equal(GDELT_PROJECT_URL, "https://www.gdeltproject.org");
});

runTest("buildEventSources carries the raw collector `source` field through as collectorSource", () => {
  const sources = buildEventSources([
    { title: "A", event_date: "2026-11-01T00:00:00Z", source: "gdelt", raw_data: { url: "https://x.example/a" } },
    { title: "B", event_date: "2026-11-02T00:00:00Z", source: "rss", raw_data: { url: "https://x.example/b" } },
  ]);
  assert.equal(sources[0].collectorSource, "gdelt");
  assert.equal(sources[1].collectorSource, "rss");
});
