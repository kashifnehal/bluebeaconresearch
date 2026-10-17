import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatStatNumber,
  loadAcledState,
  loadHowItWorksSignalCounts,
  loadKeywordFallbackShare,
  OTHER_COLLECTOR_COUNT,
  TOTAL_COLLECTOR_COUNT,
  type HowItWorksAcledClient,
  type HowItWorksCountClient,
  type HowItWorksRowsClient,
} from "./how-it-works-stats";

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

runTest("formatStatNumber adds thousands separators", () => {
  assert.equal(formatStatNumber(2996), "2,996");
  assert.equal(formatStatNumber(44), "44");
  assert.equal(formatStatNumber(0), "0");
});

runTest("how-it-works sources caption names sources, and the ACLED/keyword-fallback lines are computed live, not hardcoded", () => {
  const page = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../app/how-it-works/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("RSS feeds plus other data sources."), true);
  assert.equal(page.includes("data collectors configured in the ingestion pipeline"), false);
  // The old hardcoded ACLED claim and keyword-fallback line are gone; both
  // now come from loadAcledState/loadKeywordFallbackShare at request time.
  assert.equal(
    page.includes(
      "ACLED conflict data: ACLED is configured but returning no data (access pending), so no ACLED events are ingested yet.",
    ),
    false,
  );
  assert.match(page, /loadAcledState/);
  assert.match(page, /loadKeywordFallbackShare/);
});

runTest("TOTAL_COLLECTOR_COUNT is RSS feeds plus the collectors that actually ingest", () => {
  // 28 RSS feeds (packages/shared/src/constants/ingestion.ts) + 2 other collectors
  // that ingest today (gdelt, gnews) = 30. ACLED is excluded while it ingests
  // nothing (HTTP 403 on the data read); add it back when acled raw events exist.
  assert.equal(OTHER_COLLECTOR_COUNT, 2);
  assert.equal(TOTAL_COLLECTOR_COUNT, 28 + OTHER_COLLECTOR_COUNT);
  assert.equal(TOTAL_COLLECTOR_COUNT, 30);
});

function fakeClient(responses: Array<{ count: number | null; error: unknown }>) {
  const selects: Array<{
    table: string;
    columns: string;
    options: unknown;
    gte?: { column: string; value: string };
  }> = [];
  let i = 0;
  const client: HowItWorksCountClient = {
    from(table: string) {
      return {
        select(columns: string, options: { count: "exact"; head: true }) {
          const record: (typeof selects)[number] = { table, columns, options };
          selects.push(record);
          const next = responses[i] ?? responses[responses.length - 1];
          i += 1;
          const result = Promise.resolve(next);
          return Object.assign(result, {
            gte(column: string, value: string) {
              record.gte = { column, value };
              return Promise.resolve(next);
            },
          });
        },
      };
    },
  };
  return { client, selects };
}

async function runAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    console.error(`✖ ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function main() {
  const now = Date.parse("2026-10-16T00:00:00.000Z");
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  await runAsync("how-it-works counts use head: true", async () => {
    const { client, selects } = fakeClient([
      { count: 1200, error: null },
      { count: 40, error: null },
    ]);
    const result = await loadHowItWorksSignalCounts(async () => client, now);
    assert.deepEqual(result, { total: 1200, last7Days: 40 });
    assert.equal(selects.length, 2);
    assert.equal(selects[0].table, "signals");
    assert.equal(selects[1].table, "signals");
    assert.equal(selects[0].columns, "id");
    assert.equal(selects[1].columns, "id");
    assert.deepEqual(selects[0].options, { count: "exact", head: true });
    assert.deepEqual(selects[1].options, { count: "exact", head: true });
    assert.equal(selects[0].gte, undefined);
    assert.deepEqual(selects[1].gte, { column: "created_at", value: sevenDaysAgo });
  });

  await runAsync("a zero total stays hidden and a zero 7-day count is kept", async () => {
    const { client } = fakeClient([
      { count: 0, error: null },
      { count: 0, error: null },
    ]);
    const result = await loadHowItWorksSignalCounts(async () => client, now);
    assert.deepEqual(result, { total: null, last7Days: 0 });
  });

  function fakeRowsClient(result: { data: Array<{ classification_method: string | null }> | null; error: unknown }) {
    const seen: { column?: string; value?: string } = {};
    const client: HowItWorksRowsClient = {
      from() {
        return {
          select() {
            const base = Promise.resolve(result);
            return Object.assign(base, {
              gte(column: string, value: string) {
                seen.column = column;
                seen.value = value;
                return Promise.resolve(result);
              },
            });
          },
        };
      },
    };
    return { client, seen };
  }

  await runAsync("loadKeywordFallbackShare computes the heuristic share over the last 7 days", async () => {
    const { client, seen } = fakeRowsClient({
      data: [
        { classification_method: "claude" },
        { classification_method: "heuristic" },
        { classification_method: "heuristic" },
        { classification_method: "claude" },
      ],
      error: null,
    });
    const result = await loadKeywordFallbackShare(async () => client, now);
    assert.deepEqual(result, { heuristicCount: 2, total: 4, pct: 50 });
    assert.equal(seen.column, "created_at");
    assert.equal(seen.value, sevenDaysAgo);
  });

  await runAsync("loadKeywordFallbackShare returns null with no rows or a query error", async () => {
    const { client: emptyClient } = fakeRowsClient({ data: [], error: null });
    assert.equal(await loadKeywordFallbackShare(async () => emptyClient, now), null);
    const { client: erroredClient } = fakeRowsClient({ data: null, error: new Error("boom") });
    assert.equal(await loadKeywordFallbackShare(async () => erroredClient, now), null);
  });

  function fakeAcledClient(result: { data: { status: string | null; detail: string | null } | null; error: unknown }) {
    const client: HowItWorksAcledClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit() {
                        return { maybeSingle: () => Promise.resolve(result) };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    };
    return client;
  }

  await runAsync("loadAcledState reports a healthy row's own detail text", async () => {
    const client = fakeAcledClient({ data: { status: "ok", detail: "fetched 12 event(s)" }, error: null });
    const state = await loadAcledState(async () => client);
    assert.equal(state, "ACLED conflict data: last reported healthy (fetched 12 event(s)).");
  });

  await runAsync("loadAcledState reports an error row's own detail text, not a guess", async () => {
    const client = fakeAcledClient({
      data: { status: "error", detail: "ACLED data access denied (HTTP 403). Awaiting licence or tier upgrade. Login works." },
      error: null,
    });
    const state = await loadAcledState(async () => client);
    assert.equal(
      state,
      "ACLED conflict data: ACLED data access denied (HTTP 403). Awaiting licence or tier upgrade. Login works.",
    );
  });

  await runAsync("loadAcledState handles no row and a query error without fabricating a status", async () => {
    const noRowClient = fakeAcledClient({ data: null, error: null });
    assert.equal(await loadAcledState(async () => noRowClient), "ACLED conflict data: no health events recorded yet.");
    const erroredClient = fakeAcledClient({ data: null, error: new Error("boom") });
    assert.equal(await loadAcledState(async () => erroredClient), "ACLED conflict data: live state unavailable right now.");
  });
}

void main();
