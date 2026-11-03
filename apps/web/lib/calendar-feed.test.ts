import assert from "node:assert/strict";
import { buildCalendarFeed, type FeedEvent } from "./calendar-feed";

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

const STAMP = "2026-10-27T00:00:00Z";

function unfold(text: string): string {
  return text.replace(/\r\n /g, "");
}

function lines(text: string): string[] {
  // Split on real CRLF only (never a bare LF), then undo folding per-line
  // is not meaningful here — this splits the *raw* folded text into its
  // physical (possibly-continuation) lines.
  return text.split("\r\n").slice(0, -1); // trailing "" after final CRLF
}

const baseEvent: FeedEvent = {
  id: "evt-1",
  date: "2026-11-10",
  time: "14:30",
  timeApprox: false,
  country: "United States",
  event: "Example Release",
  sourceUrl: "https://example.gov/schedule",
  sourceLabel: "example.gov",
};

runTest("every physical line ends with CRLF and there is no bare LF", () => {
  const out = buildCalendarFeed([baseEvent], STAMP);
  assert.equal(/(?<!\r)\n/.test(out), false, "found a bare LF not preceded by CR");
  assert.ok(out.endsWith("\r\n"));
});

runTest("a line longer than 75 octets is folded and unfolding gives back the original", () => {
  const longEvent: FeedEvent = {
    ...baseEvent,
    id: "evt-long",
    event: "A Very Long Event Title That Will Definitely Exceed The Seventy Five Octet Limit For A Single iCalendar Content Line By A Wide Margin",
  };
  const out = buildCalendarFeed([longEvent], STAMP);
  const physicalLines = lines(out);
  const summaryLineIdx = physicalLines.findIndex((l) => l.startsWith("SUMMARY:"));
  assert.ok(summaryLineIdx >= 0, "SUMMARY line not found");
  // The folded SUMMARY spans this line plus every following line that starts
  // with a single leading space (a continuation), up to the next unindented line.
  const foldedChunk: string[] = [physicalLines[summaryLineIdx]];
  let i = summaryLineIdx + 1;
  while (i < physicalLines.length && physicalLines[i].startsWith(" ")) {
    foldedChunk.push(physicalLines[i]);
    i++;
  }
  assert.ok(foldedChunk.length > 1, "expected the long SUMMARY line to be folded across multiple physical lines");
  for (const l of foldedChunk) {
    assert.ok(Buffer.byteLength(l, "utf8") <= 75, `folded segment exceeds 75 octets: ${l}`);
  }
  const rejoined = unfold(foldedChunk.join("\r\n"));
  assert.equal(rejoined, `SUMMARY:${longEvent.event} (${longEvent.country})`);
});

runTest("a UTF-8 character at the fold point is not split", () => {
  const unicodeEvent: FeedEvent = {
    ...baseEvent,
    id: "evt-unicode",
    event:
      "Événement Économique Très Important Avec Des Caractères Accentués Qui Dépassent Largement La Limite De Soixante Quinze Octets Ünïcödé",
  };
  const out = buildCalendarFeed([unicodeEvent], STAMP);
  // If a multi-byte character were split mid-byte, the resulting string
  // would contain the Unicode replacement/invalid sequence when round-tripped
  // through Buffer, or the unfolded text would not match the original.
  const physicalLines = lines(out);
  const summaryLineIdx = physicalLines.findIndex((l) => l.startsWith("SUMMARY:"));
  const foldedChunk: string[] = [physicalLines[summaryLineIdx]];
  let i = summaryLineIdx + 1;
  while (i < physicalLines.length && physicalLines[i].startsWith(" ")) {
    foldedChunk.push(physicalLines[i]);
    i++;
  }
  assert.ok(foldedChunk.length > 1);
  const rejoined = unfold(foldedChunk.join("\r\n"));
  assert.equal(rejoined, `SUMMARY:${unicodeEvent.event} (${unicodeEvent.country})`);
});

runTest("commas, semicolons, backslashes and newlines in SUMMARY/DESCRIPTION are escaped", () => {
  const escapeEvent: FeedEvent = {
    ...baseEvent,
    id: "evt-escape",
    event: "Release; Part, Two\\Three",
    timeNote: "Line one\nLine two",
  };
  const out = buildCalendarFeed([escapeEvent], STAMP);
  const flat = unfold(out);
  assert.match(flat, /SUMMARY:Release\\; Part\\, Two\\\\Three \(United States\)/);
  assert.match(flat, /DESCRIPTION:Source: example\.gov\\nhttps:\/\/example\.gov\/schedule\\nLine one\\nLine two/);
});

runTest("a timed event gives DTSTART with a Z and DURATION:PT30M", () => {
  const out = unfold(buildCalendarFeed([baseEvent], STAMP));
  assert.match(out, /DTSTART:20261110T143000Z\r\n/);
  assert.match(out, /DURATION:PT30M\r\n/);
});

runTest("timeApprox true gives an all-day event with DTEND the next day", () => {
  const approxEvent: FeedEvent = { ...baseEvent, id: "evt-approx", time: "09:00", timeApprox: true };
  const out = unfold(buildCalendarFeed([approxEvent], STAMP));
  assert.match(out, /DTSTART;VALUE=DATE:20261110\r\n/);
  assert.match(out, /DTEND;VALUE=DATE:20261111\r\n/);
  assert.doesNotMatch(out, /DTSTART:/);
});

runTest("null time gives an all-day event with DTEND the next day", () => {
  const nullTimeEvent: FeedEvent = { ...baseEvent, id: "evt-null-time", time: null };
  const out = unfold(buildCalendarFeed([nullTimeEvent], STAMP));
  assert.match(out, /DTSTART;VALUE=DATE:20261110\r\n/);
  assert.match(out, /DTEND;VALUE=DATE:20261111\r\n/);
});

runTest("all-day DTEND crosses a month boundary correctly", () => {
  const monthEnd: FeedEvent = { ...baseEvent, id: "evt-month-end", date: "2026-11-30", time: null };
  const out = unfold(buildCalendarFeed([monthEnd], STAMP));
  assert.match(out, /DTSTART;VALUE=DATE:20261130\r\n/);
  assert.match(out, /DTEND;VALUE=DATE:20261201\r\n/);
});

runTest("all-day DTEND crosses a year boundary correctly", () => {
  const yearEnd: FeedEvent = { ...baseEvent, id: "evt-year-end", date: "2026-12-31", time: null };
  const out = unfold(buildCalendarFeed([yearEnd], STAMP));
  assert.match(out, /DTSTART;VALUE=DATE:20261231\r\n/);
  assert.match(out, /DTEND;VALUE=DATE:20270101\r\n/);
});

runTest("UID format is <id>@bluebeaconresearch.com", () => {
  const out = unfold(buildCalendarFeed([baseEvent], STAMP));
  assert.match(out, /UID:evt-1@bluebeaconresearch\.com\r\n/);
});

runTest("DESCRIPTION has the source label and the URL line", () => {
  const out = unfold(buildCalendarFeed([baseEvent], STAMP));
  assert.match(out, /DESCRIPTION:Source: example\.gov\\nhttps:\/\/example\.gov\/schedule\r\n/);
});

runTest("DESCRIPTION omits the URL line when sourceUrl is null", () => {
  const noUrl: FeedEvent = { ...baseEvent, id: "evt-no-url", sourceUrl: null };
  const out = unfold(buildCalendarFeed([noUrl], STAMP));
  assert.match(out, /DESCRIPTION:Source: example\.gov\r\n/);
  assert.doesNotMatch(out, /URL:/);
});

runTest('the words "Forecast", "Previous" and "Actual" never appear', () => {
  const out = buildCalendarFeed([baseEvent], STAMP);
  assert.doesNotMatch(out, /Forecast/);
  assert.doesNotMatch(out, /Previous/);
  assert.doesNotMatch(out, /Actual/);
});

runTest("same input twice gives identical output", () => {
  const out1 = buildCalendarFeed([baseEvent], STAMP);
  const out2 = buildCalendarFeed([{ ...baseEvent }], STAMP);
  assert.equal(out1, out2);
});

runTest("unsorted input comes out sorted by date, then time (null last), then id", () => {
  const events: FeedEvent[] = [
    { ...baseEvent, id: "z-last", date: "2026-11-10", time: "09:00" },
    { ...baseEvent, id: "a-no-time", date: "2026-11-10", time: null },
    { ...baseEvent, id: "a-first", date: "2026-11-09", time: "23:00" },
    { ...baseEvent, id: "b-same-time", date: "2026-11-10", time: "09:00" },
  ];
  const out = unfold(buildCalendarFeed(events, STAMP));
  const uidOrder = [...out.matchAll(/UID:([^@]+)@/g)].map((m) => m[1]);
  assert.deepEqual(uidOrder, ["a-first", "b-same-time", "z-last", "a-no-time"]);
});

runTest("empty list still gives a valid calendar with BEGIN and END", () => {
  const out = buildCalendarFeed([], STAMP);
  assert.match(out, /^BEGIN:VCALENDAR\r\n/);
  assert.match(out, /END:VCALENDAR\r\n$/);
  assert.doesNotMatch(out, /BEGIN:VEVENT/);
});
