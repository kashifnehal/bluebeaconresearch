import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "test-supabase-role-key";

const {
  parseEiaValue,
  parseEiaPeriod,
  redactUrl,
  runEiaWeeklyOnce,
  resetEiaLogsForTests,
  isMissingEiaTableError,
  EIA_PETROLEUM_SERIES,
  EIA_GAS_SERIES,
} = await import("./eia-weekly.js");

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

const PETROLEUM_FIXTURE = {
  response: {
    data: [
      { period: "2026-10-16", value: "432123" },
      { period: "2026-10-09", value: "429800" },
      { period: "2026-10-02", value: "not-a-number" },
      { period: "bad-date", value: "100" },
    ],
  },
};

const GAS_FIXTURE = {
  response: {
    data: [
      { period: "2026-10-16", value: "3701" },
      { period: "2026-10-09", value: "3650" },
    ],
  },
};

const GAS_FACET_FOUND = {
  response: { facets: [{ id: "NW2_EPG0_SWO_R48_BCF", name: "Lower 48 States Working Gas in Underground Storage" }] },
};
const GAS_FACET_FALLBACK = {
  response: { facets: [{ id: "NW2_OTHER_ID", name: "Lower 48 States Working Gas in Underground Storage" }] },
};
const GAS_FACET_NONE = {
  response: { facets: [{ id: "unrelated", name: "Something else entirely" }] },
};
const GAS_FACET_MULTIPLE = {
  response: {
    facets: [
      { id: "id-a", name: "Lower 48 States Working Gas in Underground Storage" },
      { id: "id-b", name: "Lower 48 States Working Gas Storage Alt" },
    ],
  },
};

await runTest("parseEiaValue accepts finite numbers and strings, rejects the rest", () => {
  assert.equal(parseEiaValue("432123"), 432123);
  assert.equal(parseEiaValue(432123), 432123);
  assert.equal(parseEiaValue("not-a-number"), null);
  assert.equal(parseEiaValue(null), null);
  assert.equal(parseEiaValue(undefined), null);
  assert.equal(parseEiaValue(""), null);
});

await runTest("parseEiaPeriod accepts YYYY-MM-DD only", () => {
  assert.equal(parseEiaPeriod("2026-10-16"), "2026-10-16");
  assert.equal(parseEiaPeriod("bad-date"), null);
  assert.equal(parseEiaPeriod(123), null);
  assert.equal(parseEiaPeriod(""), null);
});

await runTest("redactUrl replaces the api_key value and nothing else", () => {
  const url = "https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key=supersecret123&frequency=weekly";
  const redacted = redactUrl(url);
  assert.ok(!redacted.includes("supersecret123"));
  assert.match(redacted, /api_key=REDACTED/);
  assert.match(redacted, /frequency=weekly/);
});

function makeSupabase(error: { code?: string; message?: string } | null) {
  const upserts: Array<{ rows: Record<string, unknown>[]; opts: { onConflict?: string } }> = [];
  const fakeSupabase: any = {
    from(table: string) {
      assert.equal(table, "economic_event_values");
      return {
        upsert(rows: Record<string, unknown>[], opts: { onConflict?: string }) {
          upserts.push({ rows, opts });
          return Promise.resolve({ error });
        },
      };
    },
  };
  return { fakeSupabase, upserts };
}

function noopSleep() {
  return Promise.resolve();
}

await runTest("no key -> skipped and no fetch call", async () => {
  let calls = 0;
  const result = await runEiaWeeklyOnce({
    apiKey: "",
    sleep: noopSleep,
    fetchEia: async () => {
      calls += 1;
      return {};
    },
  });
  assert.equal(result.skipped, "no_key");
  assert.equal(calls, 0);
});

await runTest("parses both series, drops non-numeric value and invalid date, upserts the rest", async () => {
  const { fakeSupabase, upserts } = makeSupabase(null);
  const result = await runEiaWeeklyOnce({
    apiKey: "test-key",
    sleep: noopSleep,
    supabase: fakeSupabase,
    fetchEia: async (url: string) => {
      if (url.includes("facet/series")) return GAS_FACET_FOUND;
      if (url.includes(EIA_GAS_SERIES.route)) return GAS_FIXTURE;
      return PETROLEUM_FIXTURE;
    },
  });
  assert.equal(result.skipped, undefined);
  assert.equal(result.dropped, 2);
  assert.equal(result.upserted, 4); // 2 valid petroleum rows + 2 gas rows
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].opts.onConflict, "series_id,period");
  const bySeriesAndPeriod = new Map(upserts[0].rows.map((r) => [`${r.series_id}|${r.period}`, r]));
  assert.deepEqual(bySeriesAndPeriod.get(`${EIA_PETROLEUM_SERIES.seriesId}|2026-10-16`), {
    series_id: EIA_PETROLEUM_SERIES.seriesId,
    period: "2026-10-16",
    value: 432123,
    unit: EIA_PETROLEUM_SERIES.unit,
    source_url: EIA_PETROLEUM_SERIES.sourceUrl,
    released_at: null,
  });
  assert.ok(bySeriesAndPeriod.has(`${EIA_GAS_SERIES.seriesId}|2026-10-16`));
});

await runTest("missing-table path logs once and returns without throwing", async () => {
  resetEiaLogsForTests();
  const warns: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warns.push(String(args[0] ?? ""));
  try {
    const { fakeSupabase } = makeSupabase({ code: "PGRST205", message: "Could not find the table 'public.economic_event_values'" });
    const result = await runEiaWeeklyOnce({
      apiKey: "test-key",
      sleep: noopSleep,
      supabase: fakeSupabase,
      fetchEia: async (url: string) => (url.includes("facet/series") ? GAS_FACET_NONE : PETROLEUM_FIXTURE),
    });
    assert.equal(result.skipped, "missing_table");
    assert.equal(result.upserted, 0);
    const tableWarn = warns.filter((w) => /economic_event_values table is missing/.test(w));
    assert.equal(tableWarn.length, 1, "missing-table warning must log only once");
  } finally {
    console.warn = originalWarn;
  }
});

await runTest("isMissingEiaTableError matches 42P01 and PGRST205 only", () => {
  assert.equal(isMissingEiaTableError({ code: "42P01" }), true);
  assert.equal(isMissingEiaTableError({ code: "PGRST205" }), true);
  assert.equal(isMissingEiaTableError({ code: "23505" }), false);
  assert.equal(isMissingEiaTableError(null), false);
});

await runTest("one 5xx retried, then succeeds", async () => {
  let dataCallCount = 0;
  const { fakeSupabase } = makeSupabase(null);
  const result = await runEiaWeeklyOnce({
    apiKey: "test-key",
    sleep: noopSleep,
    supabase: fakeSupabase,
    fetchEia: async (url: string) => {
      if (url.includes("facet/series")) return GAS_FACET_NONE;
      dataCallCount += 1;
      if (dataCallCount === 1) {
        const err = new Error("EIA request failed: 500") as Error & { status?: number };
        err.status = 500;
        throw err;
      }
      return PETROLEUM_FIXTURE;
    },
  });
  assert.equal(dataCallCount, 2);
  assert.equal(result.upserted, 2);
});

await runTest("gas facet check: configured id present -> used directly", async () => {
  const { fakeSupabase } = makeSupabase(null);
  const result = await runEiaWeeklyOnce({
    apiKey: "test-key",
    sleep: noopSleep,
    supabase: fakeSupabase,
    fetchEia: async (url: string) => {
      if (url.includes("facet/series")) return GAS_FACET_FOUND;
      if (url.includes(EIA_GAS_SERIES.route)) return GAS_FIXTURE;
      return PETROLEUM_FIXTURE;
    },
  });
  assert.equal(result.gasSeriesId, EIA_GAS_SERIES.seriesId);
});

await runTest("gas facet check: single Lower 48 / Working Gas match -> fallback id resolved but gas skipped", async () => {
  const { fakeSupabase, upserts } = makeSupabase(null);
  let gasDataFetched = false;
  const result = await runEiaWeeklyOnce({
    apiKey: "test-key",
    sleep: noopSleep,
    supabase: fakeSupabase,
    fetchEia: async (url: string) => {
      if (url.includes("facet/series")) return GAS_FACET_FALLBACK;
      if (url.includes(EIA_GAS_SERIES.route)) {
        gasDataFetched = true;
        return GAS_FIXTURE;
      }
      return PETROLEUM_FIXTURE;
    },
  });
  assert.equal(result.gasSeriesId, "NW2_OTHER_ID");
  assert.equal(gasDataFetched, false, "a fallback-resolved gas series id must not be fetched");
  assert.equal(result.upserted, 2, "only the crude rows should be upserted, gas is skipped");
  assert.equal(upserts.length, 1);
  assert.ok(
    upserts[0].rows.every((r) => r.series_id === EIA_PETROLEUM_SERIES.seriesId),
    "no gas rows should be stored when the series id differs from the configured one",
  );
});

await runTest('gas id mismatch logs "eia gas series id differs from configured; skipped" once', async () => {
  resetEiaLogsForTests();
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0] ?? ""));
  try {
    const { fakeSupabase } = makeSupabase(null);
    await runEiaWeeklyOnce({
      apiKey: "test-key",
      sleep: noopSleep,
      supabase: fakeSupabase,
      fetchEia: async (url: string) => (url.includes("facet/series") ? GAS_FACET_FALLBACK : PETROLEUM_FIXTURE),
    });
    const mismatchLogs = logs.filter((l) => l === "eia gas series id differs from configured; skipped");
    assert.equal(mismatchLogs.length, 1, "mismatch warning must log exactly once");
  } finally {
    console.log = originalLog;
  }
});

for (const [label, fixture] of [
  ["no match", GAS_FACET_NONE],
  ["multiple matches", GAS_FACET_MULTIPLE],
] as const) {
  await runTest(`gas facet check: ${label} -> gas skipped, petroleum still fetched`, async () => {
    const { fakeSupabase } = makeSupabase(null);
    const result = await runEiaWeeklyOnce({
      apiKey: "test-key",
      sleep: noopSleep,
      supabase: fakeSupabase,
      fetchEia: async (url: string) => {
        if (url.includes("facet/series")) return fixture;
        return PETROLEUM_FIXTURE;
      },
    });
    assert.equal(result.gasSeriesId, null);
    assert.equal(result.upserted, 2);
  });
}

await runTest("the api key never appears in any logged string", async () => {
  const secret = "sk-eia-super-secret-9000";
  const logged: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  const capture = (...args: unknown[]) => {
    logged.push(args.map((a) => String(a)).join(" "));
  };
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  try {
    resetEiaLogsForTests();
    const { fakeSupabase } = makeSupabase(null);
    await runEiaWeeklyOnce({
      apiKey: secret,
      sleep: noopSleep,
      supabase: fakeSupabase,
      fetchEia: async (url: string) => {
        assert.ok(url.includes(secret)); // the real url does contain it — only logs must not
        if (url.includes("facet/series")) {
          const err = new Error(`boom: ${url}`);
          throw err;
        }
        return PETROLEUM_FIXTURE;
      },
    });
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  for (const line of logged) {
    assert.ok(!line.includes(secret), `logged string leaked the api key: ${line}`);
  }
});

await runTest("at most 6 fetch calls per run even when every call fails", async () => {
  let calls = 0;
  const { fakeSupabase } = makeSupabase(null);
  await runEiaWeeklyOnce({
    apiKey: "test-key",
    sleep: noopSleep,
    supabase: fakeSupabase,
    fetchEia: async () => {
      calls += 1;
      const err = new Error("EIA request failed: 503") as Error & { status?: number };
      err.status = 503;
      throw err;
    },
  });
  assert.ok(calls <= 6, `expected at most 6 fetch calls, got ${calls}`);
});

if (failed) process.exit(1);
