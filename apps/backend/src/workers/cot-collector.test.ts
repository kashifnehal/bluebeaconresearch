import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

const {
  parseInteger,
  parseReportDate,
  parseCotRow,
  runCotCollectorOnce,
  resetCotMissingTableLogForTests,
  isMissingCotTableError,
  buildCotRequestUrl,
} = await import("./cot-collector.js");

const SAMPLE_API_ROW = {
  report_date_as_yyyy_mm_dd: "2026-10-13T00:00:00.000",
  cftc_contract_market_code: "067651",
  market_and_exchange_names: "WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE",
  open_interest_all: "1900179",
  m_money_positions_long_all: "171973",
  m_money_positions_short_all: "131399",
  m_money_positions_spread: "286687",
  swap_positions_long_all: "126747",
  swap__positions_short_all: "605225",
  prod_merc_positions_long: "660971",
  prod_merc_positions_short: "307828",
  nonrept_positions_long_all: "80139",
  nonrept_positions_short_all: "55147",
  change_in_m_money_long_all: "-6380",
  change_in_m_money_short_all: "6644",
  traders_tot_all: "307",
  contract_units: "(CONTRACTS OF 1,000 BARRELS)",
};

let failed = false;
async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed = true;
    console.error(`✖ ${name}`);
    console.error(err);
  }
}

await runTest("parseInteger converts CFTC numeric strings, including negatives", () => {
  assert.equal(parseInteger("171973"), 171973);
  assert.equal(parseInteger("-6380"), -6380);
  assert.equal(parseInteger("307"), 307);
  assert.equal(parseInteger(1900179), 1900179);
  assert.equal(parseInteger(""), null);
  assert.equal(parseInteger(null), null);
  assert.equal(parseInteger("not-a-number"), null);
});

await runTest("parseReportDate keeps YYYY-MM-DD from a Socrata timestamp", () => {
  assert.equal(parseReportDate("2026-10-13T00:00:00.000"), "2026-10-13");
  assert.equal(parseReportDate("2026-10-13"), "2026-10-13");
  assert.equal(parseReportDate(""), null);
});

await runTest("parseCotRow maps a string-valued API row onto the upsert shape", () => {
  const row = parseCotRow(SAMPLE_API_ROW);
  assert.ok(row);
  assert.deepEqual(row, {
    report_date: "2026-10-13",
    contract_market_code: "067651",
    market_name: "WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE",
    symbol: "USOIL",
    open_interest: 1900179,
    mm_long: 171973,
    mm_short: 131399,
    mm_spread: 286687,
    swap_long: 126747,
    swap_short: 605225,
    prod_long: 660971,
    prod_short: 307828,
    nonrept_long: 80139,
    nonrept_short: 55147,
    change_mm_long: -6380,
    change_mm_short: 6644,
    traders_total: 307,
    contract_units: "(CONTRACTS OF 1,000 BARRELS)",
  });
});

await runTest("parseCotRow drops unmapped contract codes", () => {
  assert.equal(parseCotRow({ ...SAMPLE_API_ROW, cftc_contract_market_code: "999999" }), null);
});

await runTest("request URL filters mapped codes, newest first, with a 156-week limit", () => {
  const url = buildCotRequestUrl(["067651", "023651"], 156);
  assert.match(url, /\$where=/);
  assert.match(url, /cftc_contract_market_code%20in%20/);
  assert.match(url, /'067651'/);
  assert.match(url, /'023651'/);
  assert.match(url, /\$order=report_date_as_yyyy_mm_dd%20DESC/);
  assert.match(url, /\$limit=312/);
});

function makeSupabase(error: { code?: string; message?: string } | null) {
  const upserted: Array<Record<string, unknown>[]> = [];
  const fakeSupabase: any = {
    from(table: string) {
      assert.equal(table, "cot_positions");
      return {
        upsert(rows: Record<string, unknown>[], opts: { onConflict?: string }) {
          upserted.push(rows);
          assert.equal(opts.onConflict, "report_date,contract_market_code");
          return Promise.resolve({ error });
        },
      };
    },
  };
  return { fakeSupabase, upserted };
}

await runTest("upserts parsed rows by report_date and contract_market_code", async () => {
  const { fakeSupabase, upserted } = makeSupabase(null);
  const result = await runCotCollectorOnce({
    supabase: fakeSupabase,
    fetchCot: async () => [SAMPLE_API_ROW],
  });
  assert.equal(result.ok, true);
  assert.equal(result.fetched, 1);
  assert.equal(result.upserted, 1);
  assert.equal(upserted.length, 1);
  assert.equal(upserted[0][0].symbol, "USOIL");
  assert.equal(upserted[0][0].change_mm_long, -6380);
  assert.equal(upserted[0][0].report_date, "2026-10-13");
});

await runTest("missing-table path (PGRST205) logs once and returns without throwing", async () => {
  resetCotMissingTableLogForTests();
  const warns: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(String(args[0] ?? ""));
  };
  try {
    const { fakeSupabase, upserted } = makeSupabase({
      code: "PGRST205",
      message: "Could not find the table 'public.cot_positions' in the schema cache",
    });
    const result = await runCotCollectorOnce({
      supabase: fakeSupabase,
      fetchCot: async () => [SAMPLE_API_ROW],
    });
    assert.equal(result.skipped, "missing_table");
    assert.equal(result.upserted, 0);
    assert.equal(upserted.length, 1);
    assert.equal(warns.length, 1);
    assert.match(warns[0], /cot_positions table is missing/);

    const second = await runCotCollectorOnce({
      supabase: fakeSupabase,
      fetchCot: async () => [SAMPLE_API_ROW],
    });
    assert.equal(second.skipped, "missing_table");
    assert.equal(warns.length, 1, "missing-table warning must log only once");
  } finally {
    console.warn = originalWarn;
  }
});

await runTest("missing-table path also matches Postgres 42P01", () => {
  assert.equal(isMissingCotTableError({ code: "42P01", message: "undefined_table" }), true);
  assert.equal(isMissingCotTableError({ code: "PGRST205" }), true);
  assert.equal(isMissingCotTableError({ code: "23505" }), false);
});

if (failed) process.exit(1);
