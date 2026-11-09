import assert from "node:assert/strict";
import { toEventHeroProps } from "./event-hero";

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

const row = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Strait traffic slows",
  summary: "Tankers are waiting.",
  severity: 8,
  country: "Yemen",
  media_impact_entity: null,
  sources_count: 1,
  created_at: "2026-11-01T12:00:00.000Z",
  updated_at: "2026-11-01T12:00:00.000Z",
  event_date: "2026-11-01T08:00:00.000Z",
  raw_event_ids: ["re-1"],
};

runTest("maps the signal row and the earliest report's outlet link", () => {
  const hero = toEventHeroProps(
    row,
    [
      {
        title: "Wire",
        event_date: "2026-11-01T08:00:00.000Z",
        created_at: "2026-11-01T08:10:00.000Z",
        source: "rss",
        raw_data: { url: "https://example.com/a", source: "Example Wire", domain: "example.com" },
      },
    ],
    null,
  );
  assert.equal(hero.title, "Strait traffic slows");
  assert.equal(hero.summary, "Tankers are waiting.");
  assert.equal(hero.severity, 8);
  assert.equal(hero.firstReportKind, "publisher");
  assert.equal(hero.sources[0].url, "https://example.com/a");
  assert.equal(hero.sources[0].sourceLabel, "Example Wire");
});

runTest("a report with no url keeps the outlet name and a null link", () => {
  const hero = toEventHeroProps(
    row,
    [
      {
        title: "Wire",
        event_date: "2026-11-01T08:00:00.000Z",
        source: "gdelt",
        raw_data: { source: "Reuters" },
      },
    ],
    null,
  );
  assert.equal(hero.sources[0].url, null);
  assert.equal(hero.sources[0].sourceLabel, "Reuters");
  assert.equal(hero.firstReportKind, "gdelt_seen");
});
