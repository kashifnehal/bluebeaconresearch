import assert from "node:assert/strict";
import { renderWeeklyEmail, type WeeklyInput } from "./weekly-email.js";
import { weeklyEmailFixture } from "./weekly-email.fixture.js";

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

function baseInput(overrides: Partial<WeeklyInput> = {}): WeeklyInput {
  return {
    edition: 12,
    windowLabel: "Oct 27 – Nov 2, 2026",
    sentDateLabel: "03 Nov 2026",
    preheader: "This week: a Gulf supply disruption and three things to watch.",
    lead: {
      headline: "Gulf shipping lane disruption lifts freight and crude risk premiums",
      summary: "A short, factual summary of the week's lead item for layout-testing purposes.",
      eventTimeUtc: "2026-10-29T14:00:00Z",
      assessedTimeUtc: "2026-10-29T15:00:00Z",
      event: "A tanker was struck in a Gulf shipping lane.",
      exposure: [{ market: "USOIL", mechanism: "Supply route risk", note: "Freight rates up on the route." }],
      evidence: ["Reuters, Oct 29", "AP, Oct 29"],
      unknown: ["Whether the lane reopens this week"],
      url: "https://www.bluebeaconresearch.com/events/sample-id",
    },
    chart: {
      src: "https://www.bluebeaconresearch.com/charts/sample.png",
      alt: "Brent crude price, 30 days",
      caption: "Brent crude, last 30 days",
      sourceLine: "Source: Yahoo Finance",
    },
    coverage: [
      {
        market: "USOIL",
        line: "Crude held a risk premium through the week.",
        dateLabel: "Oct 29",
        url: "https://www.bluebeaconresearch.com/events/sample-id",
      },
    ],
    watch: [
      {
        dateLabel: "Nov 5",
        item: "EIA Weekly Petroleum Status Report",
        market: "USOIL",
        source: "https://www.eia.gov/petroleum/supply/weekly/",
      },
    ],
    correctionsCount: 0,
    correctionsUrl: "https://www.bluebeaconresearch.com/how-it-works",
    cta: { label: "Read the full brief", href: "https://www.bluebeaconresearch.com/weekly/12" },
    unsubscribeUrl: "https://www.bluebeaconresearch.com/settings",
    preferencesUrl: "https://www.bluebeaconresearch.com/settings",
    ...overrides,
  };
}

runTest("module order: preheader, masthead, the read, event/exposure/evidence, chart, coverage, watch, method, button, footer", () => {
  const { html } = renderWeeklyEmail(baseInput());
  const markers = [
    "display:none", // preheader
    "THE BEACON WEEKLY", // masthead
    "Gulf shipping lane disruption lifts freight", // the read (headline)
    ">Event<", // event/exposure/evidence
    "Brent crude price, 30 days", // chart alt
    ">Coverage<", // coverage table
    ">What to watch<", // watch table
    ">Method<", // method and corrections
    "Read the full brief", // primary button
    "Unsubscribe", // footer
  ];
  let lastIdx = -1;
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    assert.ok(idx >= 0, `expected to find "${marker}" in the rendered html`);
    assert.ok(idx > lastIdx, `expected "${marker}" to come after the previous module`);
    lastIdx = idx;
  }
});

runTest("chart module is omitted entirely when chart is absent", () => {
  const { html } = renderWeeklyEmail(baseInput({ chart: undefined }));
  assert.ok(!html.includes("<img"));
});

runTest("watch module is omitted entirely when watch is empty", () => {
  const { html } = renderWeeklyEmail(baseInput({ watch: [] }));
  assert.ok(!html.includes("What to watch"));
});

runTest("corrections line appears only when correctionsCount is defined", () => {
  const withCount = renderWeeklyEmail(baseInput({ correctionsCount: 2 }));
  assert.match(withCount.html, /2 corrections this edition/);
  const withoutCount = renderWeeklyEmail(baseInput({ correctionsCount: undefined }));
  assert.ok(!withoutCount.html.includes("this edition"));
});

runTest("throws when the headline is over 70 characters", () => {
  const input = baseInput();
  input.lead.headline = "x".repeat(71);
  assert.throws(() => renderWeeklyEmail(input), /headline/);
});

runTest("does not throw when the headline is exactly 70 characters", () => {
  const input = baseInput();
  input.lead.headline = "x".repeat(70);
  assert.doesNotThrow(() => renderWeeklyEmail(input));
});

runTest("throws when the preheader is over 90 characters", () => {
  const input = baseInput();
  input.preheader = "x".repeat(91);
  assert.throws(() => renderWeeklyEmail(input), /preheader/);
});

runTest("throws when the summary is empty", () => {
  const input = baseInput();
  input.lead.summary = "   ";
  assert.throws(() => renderWeeklyEmail(input), /summary/);
});

runTest("throws when lead.url is not https", () => {
  const input = baseInput();
  input.lead.url = "http://www.bluebeaconresearch.com/events/sample-id";
  assert.throws(() => renderWeeklyEmail(input), /https/);
});

runTest("throws when a coverage row's url is not https", () => {
  const input = baseInput();
  input.coverage[0].url = "http://example.com/not-secure";
  assert.throws(() => renderWeeklyEmail(input), /https/);
});

runTest("throws when a watch row's source is not https", () => {
  const input = baseInput();
  input.watch[0].source = "http://example.com/not-secure";
  assert.throws(() => renderWeeklyEmail(input), /https/);
});

runTest("throws when the rendered HTML is over the 90,000-byte limit", () => {
  const input = baseInput();
  input.lead.evidence = Array.from({ length: 2000 }, (_, i) => `Padding evidence line number ${i} for size testing.`);
  assert.throws(() => renderWeeklyEmail(input), /90000-byte limit/);
});

runTest("does not throw for a normally-sized input", () => {
  assert.doesNotThrow(() => renderWeeklyEmail(baseInput()));
});

runTest("no market-direction arrows in either twin", () => {
  const { html, text } = renderWeeklyEmail(baseInput());
  assert.ok(!/[↑↓↕]/.test(html));
  assert.ok(!/[↑↓↕]/.test(text));
});

runTest("no literal <script> tag survives hostile input in any text field", () => {
  const hostile = `<script>document.location='https://evil.example'</script>`;
  const input = baseInput();
  input.lead.headline = "x".repeat(69); // stay under the 70-char cap while hostile elsewhere
  input.lead.summary = hostile;
  input.lead.event = hostile;
  input.lead.exposure = [{ market: hostile, mechanism: hostile, note: hostile }];
  input.lead.evidence = [hostile];
  input.lead.unknown = [hostile];
  input.coverage = [{ market: hostile, line: hostile, dateLabel: hostile, url: "https://example.com" }];
  input.watch = [{ dateLabel: hostile, item: hostile, market: hostile, source: "https://example.com" }];
  input.cta = { label: hostile, href: "https://example.com" };
  const { html } = renderWeeklyEmail(input);
  assert.ok(!html.includes("<script>"), `found a literal <script> tag in:\n${html}`);
});

runTest("chart alt text is present when chart is set", () => {
  const { html } = renderWeeklyEmail(baseInput());
  assert.match(html, /alt="Brent crude price, 30 days"/);
});

runTest("the text twin contains the cta href and the unsubscribe URL", () => {
  const { text } = renderWeeklyEmail(baseInput());
  assert.ok(text.includes("https://www.bluebeaconresearch.com/weekly/12"));
  assert.ok(text.includes("https://www.bluebeaconresearch.com/settings"));
});

runTest("the fixture renders without throwing and is clearly labelled as a sample", () => {
  const { html, text } = renderWeeklyEmail(weeklyEmailFixture);
  assert.match(html, /SAMPLE LAYOUT: placeholder content, not published research/);
  assert.match(text, /SAMPLE LAYOUT: placeholder content, not published research/);
});
