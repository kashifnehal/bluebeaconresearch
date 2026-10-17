import assert from "node:assert/strict";

import {
  COT_CACHE_CONTROL,
  COT_WEEKS,
  cotResponseFromQuery,
  isMissingTableError,
  normalizeCotRows,
  summarizeCot,
} from "./cot";

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

runTest("the edge cache header is exactly the weekly-data policy", () => {
  assert.equal(COT_CACHE_CONTROL, "public, s-maxage=3600, stale-while-revalidate=86400");
});

runTest("rows are normalised, sorted ascending, and net is long minus short", () => {
  const rows = normalizeCotRows([
    { report_date: "2026-10-06", mm_long: 120, mm_short: 50, mm_spread: 10 },
    { report_date: "2026-09-29T00:00:00+00:00", mm_long: "100", mm_short: "70" },
  ]);
  assert.deepEqual(rows.map((r) => r.reportDate), ["2026-09-29", "2026-10-06"]);
  assert.equal(rows[0].net, 30);
  assert.equal(rows[0].spread, null);
  assert.equal(rows[1].net, 70);
  assert.equal(rows[1].spread, 10);
});

runTest("rows missing a date, long or short are dropped", () => {
  const rows = normalizeCotRows([
    { report_date: "2026-10-06", mm_long: 5, mm_short: 2 },
    { report_date: "2026-10-13", mm_long: 5 },
    { report_date: "bad", mm_long: 1, mm_short: 1 },
    { mm_long: 1, mm_short: 1 },
    null,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].net, 3);
});

runTest("summary gives the latest week and the change from the week before", () => {
  const rows = normalizeCotRows([
    { report_date: "2026-09-29", mm_long: 100, mm_short: 70 },
    { report_date: "2026-10-06", mm_long: 120, mm_short: 50 },
  ]);
  const s = summarizeCot(rows);
  assert.equal(s?.latest.reportDate, "2026-10-06");
  assert.equal(s?.netChange, 40);
  assert.equal(summarizeCot(rows.slice(0, 1))?.netChange, null);
  assert.equal(summarizeCot([]), null);
});

runTest("a missing table (42P01 or PGRST205) is available:false with status 200", () => {
  for (const code of ["42P01", "PGRST205"]) {
    assert.equal(isMissingTableError({ code }), true);
    const out = cotResponseFromQuery("GOLD", { data: null, error: { code, message: "x" } });
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, { available: false });
  }
});

runTest("other database errors are a 500 and are never cached", () => {
  const out = cotResponseFromQuery("GOLD", { data: null, error: { code: "XX000", message: "boom" } });
  assert.equal(out.status, 500);
  assert.equal(out.cacheControl, "no-store");
});

runTest("a successful query returns at most 52 weeks with the weekly cache header", () => {
  const data = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 9, 1) + i * 7 * 86_400_000).toISOString().slice(0, 10);
    return { report_date: d, mm_long: 10 + i, mm_short: 5 };
  });
  const out = cotResponseFromQuery("GOLD", { data, error: null });
  assert.equal(out.status, 200);
  assert.equal(out.cacheControl, COT_CACHE_CONTROL);
  const body = out.body as { available: true; rows: { net: number }[] };
  assert.equal(body.available, true);
  assert.equal(body.rows.length, COT_WEEKS);
  // Keeps the newest 52 (the last row of the input).
  assert.equal(body.rows[body.rows.length - 1].net, 10 + 59 - 5);
});
