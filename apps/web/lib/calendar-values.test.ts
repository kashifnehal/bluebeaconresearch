import assert from "node:assert/strict";
import { formatOfficialFigures, type OfficialFigureRow } from "./calendar-values";

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

function row(overrides: Partial<OfficialFigureRow> = {}): OfficialFigureRow {
  return {
    series_id: "WCESTUS1",
    period: "2026-10-17",
    value: 425000,
    unit: "thousand barrels",
    source_url: "https://www.eia.gov/petroleum/supply/weekly/",
    released_at: "2026-10-22T14:30:00Z",
    fetched_at: "2026-10-22T15:00:00Z",
    ...overrides,
  };
}

runTest("WCESTUS1 converts thousand barrels to million barrels with one decimal", () => {
  const [figure] = formatOfficialFigures([row({ value: 425300 })]);
  assert.equal(figure.latestValueText, "425.3");
  assert.equal(figure.unitText, "million barrels");
});

runTest("NW2_EPG0_SWO_R48_BCF shows Bcf with no decimals", () => {
  const [figure] = formatOfficialFigures([
    row({ series_id: "NW2_EPG0_SWO_R48_BCF", value: 3812, unit: "Bcf" }),
  ]);
  assert.equal(figure.latestValueText, "3812");
  assert.equal(figure.unitText, "Bcf");
});

runTest("change is the plain signed difference between latest and previous", () => {
  const [figure] = formatOfficialFigures([
    row({ period: "2026-10-17", value: 425300 }),
    row({ period: "2026-10-10", value: 423000 }),
  ]);
  assert.equal(figure.previousValueText, "423.0");
  assert.equal(figure.changeText, "+2.3");
});

runTest("a negative change keeps its sign", () => {
  const [figure] = formatOfficialFigures([
    row({ period: "2026-10-17", value: 423000 }),
    row({ period: "2026-10-10", value: 425300 }),
  ]);
  assert.equal(figure.changeText, "-2.3");
});

runTest("a missing previous row shows no change and no previous value, not a crash", () => {
  const [figure] = formatOfficialFigures([row({ period: "2026-10-17" })]);
  assert.equal(figure.previousValueText, null);
  assert.equal(figure.changeText, null);
});

runTest("picks the latest two periods when more than two rows are passed for one series", () => {
  const [figure] = formatOfficialFigures([
    row({ period: "2026-10-03", value: 400000 }),
    row({ period: "2026-10-17", value: 425300 }),
    row({ period: "2026-10-10", value: 423000 }),
  ]);
  assert.equal(figure.period, "Week ending Oct 17, 2026");
  assert.equal(figure.changeText, "+2.3");
});

runTest("an unknown series_id is dropped, not shown with a blank label", () => {
  const result = formatOfficialFigures([row({ series_id: "SOME_UNKNOWN_SERIES" })]);
  assert.equal(result.length, 0);
});

runTest("output order follows the fixed series order, not input order", () => {
  const result = formatOfficialFigures([
    row({ series_id: "NW2_EPG0_SWO_R48_BCF", value: 3800 }),
    row({ series_id: "WCESTUS1", value: 425000 }),
  ]);
  assert.deepEqual(result.map((f) => f.seriesId), ["WCESTUS1", "NW2_EPG0_SWO_R48_BCF"]);
});

runTest("sourceUrl and fetchedMonthYear come from the latest row", () => {
  const [figure] = formatOfficialFigures([
    row({ source_url: "https://www.eia.gov/petroleum/supply/weekly/", fetched_at: "2026-10-22T15:00:00Z" }),
  ]);
  assert.equal(figure.sourceUrl, "https://www.eia.gov/petroleum/supply/weekly/");
  assert.equal(figure.fetchedMonthYear, "October 2026");
});

runTest("no rows produces no figures", () => {
  assert.deepEqual(formatOfficialFigures([]), []);
});
