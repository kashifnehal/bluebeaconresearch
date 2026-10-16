import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import type { OutcomeRowsObservation } from "@/lib/signal-outcomes-server";
import type { BaselineFetchTiming, PricePointsTiming } from "@/lib/price-baseline-server";
import { withBudget } from "@/lib/with-budget";
import { GET } from "./route";

function runTest(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✔ ${name}`);
    })
    .catch((err) => {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    });
}

const SIGNAL_ID = "sig-timing-1";

const signalRow = {
  id: SIGNAL_ID,
  title: "Strait traffic",
  summary: "Ships are waiting.",
  severity: 7,
  confidence: 0.6,
  event_type: "conflict",
  country: "Iran",
  region: "Middle East",
  commodity_impacts: [{ asset: "USOIL", direction: "up" }],
  currency_pair_impacts: [],
  raw_event_ids: ["re-1"],
  event_date: "2026-10-01T00:00:00.000Z",
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  sources_count: 1,
  is_breaking: false,
  is_active: true,
};

type PriceRow = { symbol: string; price: number | null; fetched_at: string };

function priceAtOrBeforeRow(rows: PriceRow[], symbol: string, at: string): PriceRow | null {
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) return null;
  let best: PriceRow | null = null;
  for (const row of rows) {
    if (row.symbol !== symbol) continue;
    const rt = new Date(row.fetched_at).getTime();
    if (!Number.isFinite(rt) || rt > t) continue;
    if (!best || rt > new Date(best.fetched_at).getTime()) best = row;
  }
  return best;
}

function latestPriceRow(rows: PriceRow[], symbol: string): PriceRow | null {
  let best: PriceRow | null = null;
  for (const row of rows) {
    if (row.symbol !== symbol) continue;
    const rt = new Date(row.fetched_at).getTime();
    if (!best || rt > new Date(best.fetched_at).getTime()) best = row;
  }
  return best;
}

function earliestRawEventDate(
  rawEvents: Array<Record<string, unknown>>,
  ids: string[],
): string | null {
  let best: { at: string; t: number } | null = null;
  for (const row of rawEvents) {
    if (typeof row.id !== "string" || !ids.includes(row.id)) continue;
    const at = row.event_date;
    if (typeof at !== "string" || !at) continue;
    const t = new Date(at).getTime();
    if (!Number.isFinite(t)) continue;
    if (!best || t < best.t) best = { at, t };
  }
  return best?.at ?? null;
}

function quotesFor(input: {
  symbols: string[];
  flaggedAt: string;
  rawIds: string[];
  fallback: string;
  rawEvents: Array<Record<string, unknown>>;
  priceRows: PriceRow[];
}) {
  const reportAt = earliestRawEventDate(input.rawEvents, input.rawIds) ?? input.fallback;
  return input.symbols.map((asset) => {
    const atReport = priceAtOrBeforeRow(input.priceRows, asset, reportAt);
    const atFlag = priceAtOrBeforeRow(input.priceRows, asset, input.flaggedAt);
    const current = latestPriceRow(input.priceRows, asset);
    return {
      asset,
      priceAtSignal: atReport?.price ?? null,
      priceAtSignalDate: atReport?.fetched_at ?? null,
      priceAtFlagged: atFlag?.price ?? null,
      priceAtFlaggedDate: atFlag?.fetched_at ?? null,
      currentPrice: current?.price ?? null,
      currentPriceDate: current?.fetched_at ?? null,
    };
  });
}

const STEP_NAMES = [
  "auth",
  "signal",
  "raw_events",
  "outcomes",
  "prices",
  "baselines",
  "response",
] as const;

function makeSupabase(
  counter: { executions: number },
  options?: {
    signal?: typeof signalRow;
    rawEvents?: Array<Record<string, unknown>>;
    priceLte?: string[];
    rawSelect?: { value: string };
    hangHistorical?: boolean;
    hangPrices?: boolean;
    delayRawMs?: number;
    rawGate?: { settled: boolean };
    pricePhases?: string[];
    signalDelayMs?: number;
    signalError?: string;
    optionalReadBudgetMs?: number;
    priceRows?: PriceRow[];
    rpcMode?: "missing" | "missing-message" | "error" | "ok";
    rpcPayload?: unknown;
    rpcCalls?: Array<{ fn: string; args: Record<string, unknown> }>;
  },
) {
  const signal = options?.signal ?? signalRow;
  const rawEvents = options?.rawEvents ?? [
    {
      id: "re-1",
      title: "Wire copy",
      event_date: "2026-10-01T00:00:00.000Z",
      created_at: "2026-10-01T00:00:00.000Z",
      raw_data: {
        url: "https://example.com/story",
        source: "Wire",
        domain: "example.com",
      },
    },
  ];
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      let lteValue: string | undefined;
      let symbol: string | undefined;
      builder.select = (cols?: string) => {
        if (table === "raw_events" && typeof cols === "string" && options?.rawSelect) {
          options.rawSelect.value = cols;
        }
        return builder;
      };
      builder.eq = (column: string, value: string) => {
        if (table === "commodity_prices" && column === "symbol") symbol = value;
        return builder;
      };
      builder.neq = self;
      builder.or = self;
      builder.in = self;
      builder.gte = self;
      builder.lte = (column: string, value: string) => {
        if (table === "commodity_prices" && column === "fetched_at") {
          lteValue = value;
          options?.priceLte?.push(value);
        }
        return builder;
      };
      builder.order = self;
      builder.limit = self;
      builder.maybeSingle = () => {
        if (table === "commodity_prices" && options?.pricePhases) {
          const kind = lteValue === undefined ? "latest" : "bounded";
          const phase = options.rawGate?.settled ? "after-raw" : "with-raw";
          options.pricePhases.push(`${phase}:${kind}`);
        }
        if (table === "commodity_prices" && options?.hangPrices) {
          counter.executions += 1;
          return new Promise(() => {});
        }
        counter.executions += 1;
        const finish = () => {
          if (table === "signals") {
            if (options?.signalError) {
              return { data: null, error: { message: options.signalError } };
            }
            return { data: signal, error: null };
          }
          if (table === "commodity_prices") {
            if (options?.priceRows) {
              const match =
                lteValue === undefined
                  ? latestPriceRow(options.priceRows, symbol ?? "")
                  : priceAtOrBeforeRow(options.priceRows, symbol ?? "", lteValue);
              return {
                data: match ? { price: match.price, fetched_at: match.fetched_at } : null,
                error: null,
              };
            }
            return {
              data: { price: 71.2, fetched_at: "2026-10-14T00:00:00.000Z" },
              error: null,
            };
          }
          return { data: null, error: null };
        };
        const signalDelayMs = options?.signalDelayMs;
        if (table === "signals" && signalDelayMs) {
          return new Promise((resolve) => {
            setTimeout(() => resolve(finish()), signalDelayMs);
          });
        }
        return Promise.resolve(finish());
      };
      builder.range = () => {
        counter.executions += 1;
        return Promise.resolve({ data: [], error: null });
      };
      builder.then = (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => {
        counter.executions += 1;
        if (table === "signals" && options?.hangHistorical) return new Promise(() => {});
        const data = table === "raw_events" ? rawEvents : [];
        if (table === "raw_events" && options?.delayRawMs) {
          return new Promise((resolve) => {
            setTimeout(() => {
              if (options.rawGate) options.rawGate.settled = true;
              resolve({ data, error: null });
            }, options.delayRawMs);
          }).then(onFulfilled, onRejected);
        }
        if (table === "raw_events" && options?.rawGate) options.rawGate.settled = true;
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      };
      return builder;
    },
    rpc(fn: string, args: Record<string, unknown>) {
      options?.rpcCalls?.push({ fn, args });
      if (options?.rpcMode === "error") {
        return Promise.resolve({
          data: null,
          error: { code: "57014", message: "canceling statement due to statement timeout" },
        });
      }
      if (options?.rpcMode === "missing-message") {
        return Promise.resolve({
          data: null,
          error: { message: "Could not find the function public.get_event_price_bundle" },
        });
      }
      if (options?.rpcMode === "ok") {
        const symbols = Array.isArray(args.p_symbols) ? (args.p_symbols as string[]) : [];
        const data =
          options.rpcPayload !== undefined
            ? options.rpcPayload
            : quotesFor({
                symbols,
                flaggedAt: String(args.p_flagged_at ?? ""),
                rawIds: Array.isArray(args.p_raw_event_ids)
                  ? (args.p_raw_event_ids as string[])
                  : [],
                fallback: String(args.p_fallback_report_at ?? ""),
                rawEvents,
                priceRows: options.priceRows ?? [],
              });
        return Promise.resolve({ data, error: null });
      }
      return Promise.resolve({
        data: null,
        error: {
          code: "PGRST202",
          message:
            "Could not find the function public.get_event_price_bundle(text[], timestamptz, uuid[], timestamptz) in the schema cache",
        },
      });
    },
  };
}

function makeDeps(
  counter: { executions: number },
  options?: Parameters<typeof makeSupabase>[1],
) {
  return {
    getRouteSupabaseClients: async () => ({
      supabase: makeSupabase(counter, options),
      supabaseAuth: {},
      user: { id: "user-1" },
    }),
    fetchSignalOutcomeRows: async (
      _supabase: unknown,
      _assets: string[],
      observation?: OutcomeRowsObservation,
    ) => {
      if (observation) observation.cacheStatus = "miss";
      return [];
    },
    prefetchAssetPricePoints: (
      _supabase: unknown,
      _assets: string[],
      pricePoints?: PricePointsTiming,
    ) => {
      if (!pricePoints) return;
      pricePoints.ms = 8;
      pricePoints.pending = 0;
      pricePoints.cacheStatus = "miss";
    },
    fetchMatchedBaselinesWithTimeout: async (
      _supabase: unknown,
      _assets: string[],
      _rows: unknown,
      _timeoutMs?: number,
      timing?: BaselineFetchTiming,
    ) => {
      if (timing) timing.timedOut = false;
      return { USOIL: [] };
    },
    loadMediaImpactCaveats: async () => new Map<string, string>(),
    optionalReadBudgetMs: options?.optionalReadBudgetMs,
  };
}

function callGet(deps: ReturnType<typeof makeDeps>) {
  return GET(
    new NextRequest(`https://app.example.com/api/signals/${SIGNAL_ID}`),
    { params: Promise.resolve({ id: SIGNAL_ID }) },
    deps as never,
  );
}

async function main() {
  const previous = process.env.SERVER_TIMING;

  await runTest("SERVER_TIMING unset or not true sends no Server-Timing header", async () => {
    try {
      for (const value of [undefined, "false", "TRUE", ""]) {
        if (value === undefined) delete process.env.SERVER_TIMING;
        else process.env.SERVER_TIMING = value;
        const counter = { executions: 0 };
        const res = await callGet(makeDeps(counter));
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("Server-Timing"), null);
        const body = await res.json();
        assert.equal(body.signal.id, SIGNAL_ID);
        assert.equal(body.pricesAtSignal[0].asset, "USOIL");
        assert.equal(body.pricesAtSignal[0].currentPrice, 71.2);
        assert.equal(body.pricesAtSignal[0].priceAtSignal, 71.2);
        assert.equal(body.pricesAtSignal[0].priceAtFlagged, 71.2);
        assert.equal(body.firstReportAt, "2026-10-01T00:00:00.000Z");
        assert.equal(body.firstReportKind, null);
        assert.equal(body.firstFetchedAt, "2026-10-01T00:00:00.000Z");
      }
    } finally {
      if (previous === undefined) delete process.env.SERVER_TIMING;
      else process.env.SERVER_TIMING = previous;
    }
  });

  await runTest("SERVER_TIMING=true names every step and does not change the body or query count", async () => {
    try {
      delete process.env.SERVER_TIMING;
      const offCounter = { executions: 0 };
      const off = await callGet(makeDeps(offCounter));
      const offBody = await off.json();

      process.env.SERVER_TIMING = "true";
      const onCounter = { executions: 0 };
      const on = await callGet(makeDeps(onCounter));
      const onBody = await on.json();

      assert.equal(on.status, 200);
      assert.equal(off.status, on.status);
      assert.deepEqual(offBody, onBody);
      assert.equal(onCounter.executions, offCounter.executions);

      const header = on.headers.get("Server-Timing");
      assert.ok(header);
      for (const name of STEP_NAMES) {
        assert.match(header, new RegExp(`(?:^|, )${name};dur=\\d+`));
      }
      assert.match(header, /outcomes;dur=\d+;desc="miss"/);
      assert.match(header, /prices;dur=\d+;desc="miss"/);
      assert.match(header, /baselines;dur=\d+;desc="ok"/);
      assert.equal(header.includes(SIGNAL_ID), false);
      assert.equal(header.includes("USOIL"), false);
      assert.equal(header.includes("user-1"), false);
    } finally {
      if (previous === undefined) delete process.env.SERVER_TIMING;
      else process.env.SERVER_TIMING = previous;
    }
  });

  await runTest("clock fields follow the earliest linked report, and quotes use that time and the flag time", async () => {
    const priceLte: string[] = [];
    const rawSelect = { value: "" };
    const signal = {
      ...signalRow,
      event_date: "2026-10-05T12:00:00.000Z",
      created_at: "2026-10-05T10:54:14.000Z",
    };
    const res = await callGet(
      makeDeps(
        { executions: 0 },
        {
          signal,
          priceLte,
          rawSelect,
          rawEvents: [
            {
              id: "re-late",
              title: "Later wire",
              source: "newsapi",
              event_date: "2026-10-05T09:00:00.000Z",
              created_at: "2026-10-05T09:30:00.000Z",
              raw_data: { url: "https://example.com/late" },
            },
            {
              id: "re-early",
              title: "Earlier wire",
              source: "rss",
              event_date: "2026-10-04T20:13:41.000Z",
              created_at: "2026-10-05T01:00:00.000Z",
              raw_data: { url: "https://example.com/early" },
            },
            {
              id: "re-bad",
              title: "Bad date",
              source: "gdelt",
              event_date: "not-a-date",
              created_at: "not-a-date",
              raw_data: {},
            },
          ],
        },
      ),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(rawSelect.value.includes("source"), true);
    assert.equal(body.firstReportAt, "2026-10-04T20:13:41.000Z");
    assert.equal(body.firstReportKind, "publisher");
    assert.equal(body.firstFetchedAt, "2026-10-05T01:00:00.000Z");
    assert.equal(body.signal.eventDate, "2026-10-05T12:00:00.000Z");
    assert.deepEqual(priceLte, [
      "2026-10-05T10:54:14.000Z",
      "2026-10-04T20:13:41.000Z",
    ]);
    assert.equal(body.pricesAtSignal[0].priceAtFlaggedDate, "2026-10-14T00:00:00.000Z");
  });

  await runTest("a slow optional read returns the signal with empty arrays and lists it in degraded", async () => {
    const previous = process.env.SERVER_TIMING;
    process.env.SERVER_TIMING = "true";
    try {
      const res = await callGet(
        makeDeps(
          { executions: 0 },
          { hangHistorical: true, optionalReadBudgetMs: 30 },
        ),
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.signal.id, SIGNAL_ID);
      assert.deepEqual(body.historicalComparisons, []);
      assert.deepEqual(body.degraded, ["historical"]);
      assert.equal(body.sources.length, 1);
      assert.equal(body.pricesAtSignal[0].asset, "USOIL");
      const header = res.headers.get("Server-Timing");
      assert.ok(header);
      assert.match(header, /historical;dur=\d+;desc="skipped"/);
      assert.match(header, /(?:^|, )raw_events;dur=\d+/);
      assert.equal(/raw_events;dur=\d+;desc="skipped"/.test(header), false);
    } finally {
      if (previous === undefined) delete process.env.SERVER_TIMING;
      else process.env.SERVER_TIMING = previous;
    }
  });

  await runTest("all fast optional reads return degraded []", async () => {
    const res = await callGet(makeDeps({ executions: 0 }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.signal.id, SIGNAL_ID);
    assert.deepEqual(body.degraded, []);
    assert.ok(Array.isArray(body.historicalComparisons));
    assert.ok(Array.isArray(body.relatedEvents));
    assert.ok(Array.isArray(body.pricesAtSignal));
    assert.ok(Array.isArray(body.sources));
  });

  await runTest("a slow signal row is not skipped", async () => {
    const started = Date.now();
    const res = await callGet(
      makeDeps(
        { executions: 0 },
        { signalDelayMs: 80, optionalReadBudgetMs: 20 },
      ),
    );
    assert.ok(Date.now() - started >= 70);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.signal.id, SIGNAL_ID);
    assert.equal(body.signal.title, "Strait traffic");
    assert.deepEqual(body.degraded, []);

    const errorStarted = Date.now();
    const realError = console.error;
    console.error = () => {};
    try {
      const errorRes = await callGet(
        makeDeps(
          { executions: 0 },
          { signalDelayMs: 80, signalError: "db down", optionalReadBudgetMs: 20 },
        ),
      );
      assert.ok(Date.now() - errorStarted >= 70);
      assert.equal(errorRes.status, 500);
      const errorBody = await errorRes.json();
      assert.equal(errorBody.error.code, "db_error");
    } finally {
      console.error = realError;
    }
  });

  await runTest("price lookups start together, and a skipped lookup stays in degraded", async () => {
    const pricePhases: string[] = [];
    const rawGate = { settled: false };
    const res = await callGet(
      makeDeps(
        { executions: 0 },
        { pricePhases, rawGate, delayRawMs: 40 },
      ),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.pricesAtSignal[0].asset, "USOIL");
    assert.equal(body.pricesAtSignal[0].priceAtSignal, 71.2);
    assert.equal(body.pricesAtSignal[0].priceAtFlagged, 71.2);
    assert.equal(body.pricesAtSignal[0].currentPrice, 71.2);
    const withRaw = pricePhases.filter((phase) => phase.startsWith("with-raw:"));
    assert.deepEqual(withRaw.sort(), ["with-raw:bounded", "with-raw:latest"]);
    assert.equal(pricePhases.includes("after-raw:bounded"), true);
    assert.equal(pricePhases.filter((phase) => phase.startsWith("with-raw:")).length, 2);

    const skipped = await callGet(
      makeDeps(
        { executions: 0 },
        { hangPrices: true, optionalReadBudgetMs: 30 },
      ),
    );
    assert.equal(skipped.status, 200);
    const skippedBody = await skipped.json();
    assert.equal(skippedBody.signal.id, SIGNAL_ID);
    assert.deepEqual(skippedBody.pricesAtSignal, []);
    assert.deepEqual(skippedBody.degraded, ["price_at_signal"]);
  });

  await runTest("withBudget clears its timer when the promise settles", async () => {
    const tracked = new Set<unknown>();
    const cleared = new Set<unknown>();
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    globalThis.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      const id = realSet(fn as never, ms, ...(args as []));
      if (ms === 60_000) tracked.add(id);
      return id;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((id?: Parameters<typeof clearTimeout>[0]) => {
      if (id !== undefined && tracked.has(id)) cleared.add(id);
      return realClear(id as never);
    }) as typeof clearTimeout;
    try {
      const value = await withBudget(Promise.resolve("ok"), 60_000, "fallback");
      assert.equal(value, "ok");
      assert.equal(tracked.size, 1);
      assert.equal(cleared.size, 1);
    } finally {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
      for (const id of tracked) realClear(id as never);
    }
  });

  const sharedRawEvents = [
    {
      id: "re-late",
      title: "Later wire",
      source: "newsapi",
      event_date: "2026-10-05T09:00:00.000Z",
      created_at: "2026-10-05T09:30:00.000Z",
      raw_data: { url: "https://example.com/late" },
    },
    {
      id: "re-early",
      title: "Earlier wire",
      source: "rss",
      event_date: "2026-10-04T20:13:41.000Z",
      created_at: "2026-10-05T01:00:00.000Z",
      raw_data: { url: "https://example.com/early" },
    },
    {
      id: "re-bad",
      title: "Bad date",
      source: "gdelt",
      event_date: "not-a-date",
      created_at: "2026-10-04T00:00:00.000Z",
      raw_data: {},
    },
  ];
  const sharedPriceRows: PriceRow[] = [
    { symbol: "USOIL", price: 70, fetched_at: "2026-10-01T00:00:00.000Z" },
    { symbol: "USOIL", price: 72, fetched_at: "2026-10-04T20:13:41.000Z" },
    { symbol: "USOIL", price: 74, fetched_at: "2026-10-05T10:54:14.000Z" },
    { symbol: "USOIL", price: 80, fetched_at: "2026-10-14T00:00:00.000Z" },
    { symbol: "BRENT", price: 81, fetched_at: "2026-10-02T00:00:00.000Z" },
  ];
  const sharedSignal = {
    ...signalRow,
    raw_event_ids: ["re-late", "re-early", "re-bad"],
    event_date: "2026-10-05T12:00:00.000Z",
    created_at: "2026-10-05T10:54:14.000Z",
    commodity_impacts: [
      { asset: "USOIL", direction: "up" },
      { asset: "BRENT", direction: "up" },
    ],
  };
  const sharedExpected = quotesFor({
    symbols: ["USOIL", "BRENT"],
    flaggedAt: sharedSignal.created_at,
    rawIds: sharedSignal.raw_event_ids,
    fallback: sharedSignal.event_date,
    rawEvents: sharedRawEvents,
    priceRows: sharedPriceRows,
  });

  await runTest("the function path returns the same price objects as the row reads", async () => {
    const oldLte: string[] = [];
    const oldRes = await callGet(
      makeDeps(
        { executions: 0 },
        {
          signal: sharedSignal,
          rawEvents: sharedRawEvents,
          priceRows: sharedPriceRows,
          priceLte: oldLte,
        },
      ),
    );
    const rpcLte: string[] = [];
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const rpcRes = await callGet(
      makeDeps(
        { executions: 0 },
        {
          signal: sharedSignal,
          rawEvents: sharedRawEvents,
          priceRows: sharedPriceRows,
          priceLte: rpcLte,
          rpcMode: "ok",
          rpcCalls,
        },
      ),
    );
    assert.equal(oldRes.status, 200);
    assert.equal(rpcRes.status, 200);
    const oldBody = await oldRes.json();
    const rpcBody = await rpcRes.json();
    assert.deepEqual(oldBody.pricesAtSignal, sharedExpected);
    assert.deepEqual(rpcBody.pricesAtSignal, oldBody.pricesAtSignal);
    assert.deepEqual(rpcBody.degraded, []);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0].fn, "get_event_price_bundle");
    assert.ok(oldLte.length > 0);
    assert.deepEqual(rpcLte, []);
  });

  await runTest("a missing function keeps the row reads and the same prices", async () => {
    const codes = ["PGRST202", "message"] as const;
    for (const code of codes) {
      const lte: string[] = [];
      const res = await callGet(
        makeDeps(
          { executions: 0 },
          {
            signal: sharedSignal,
            rawEvents: sharedRawEvents,
            priceRows: sharedPriceRows,
            priceLte: lte,
            rpcMode: code === "PGRST202" ? "missing" : "missing-message",
          },
        ),
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.pricesAtSignal, sharedExpected);
      assert.deepEqual(body.degraded, []);
      assert.ok(lte.length > 0);
    }

    const realError = console.error;
    console.error = () => {};
    try {
      const failed = await callGet(
        makeDeps(
          { executions: 0 },
          {
            signal: sharedSignal,
            rawEvents: sharedRawEvents,
            priceRows: sharedPriceRows,
            rpcMode: "error",
          },
        ),
      );
      assert.equal(failed.status, 200);
      const failedBody = await failed.json();
      assert.deepEqual(failedBody.pricesAtSignal, []);
      assert.deepEqual(failedBody.degraded, ["price_at_signal"]);
      assert.equal(failedBody.signal.id, sharedSignal.id);
    } finally {
      console.error = realError;
    }
  });

  await runTest("a symbol with no price row stays null", async () => {
    const signal = {
      ...signalRow,
      commodity_impacts: [{ asset: "UNKNOWN", direction: "up" }],
    };
    const res = await callGet(
      makeDeps(
        { executions: 0 },
        {
          signal,
          rpcMode: "ok",
          rpcPayload: [
            {
              asset: "UNKNOWN",
              priceAtSignal: null,
              priceAtSignalDate: null,
              priceAtFlagged: null,
              priceAtFlaggedDate: null,
              currentPrice: null,
              currentPriceDate: null,
            },
          ],
        },
      ),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.pricesAtSignal, [
      {
        asset: "UNKNOWN",
        priceAtSignal: null,
        priceAtSignalDate: null,
        priceAtFlagged: null,
        priceAtFlaggedDate: null,
        currentPrice: null,
        currentPriceDate: null,
      },
    ]);
  });

  await runTest("no linked raw events pass the signal fallback time", async () => {
    const signal = {
      ...signalRow,
      raw_event_ids: [] as string[],
      event_date: "2026-10-01T00:00:00.000Z",
      created_at: "2026-10-05T10:54:14.000Z",
    };
    const priceRows: PriceRow[] = [
      { symbol: "USOIL", price: 70, fetched_at: "2026-10-01T00:00:00.000Z" },
      { symbol: "USOIL", price: 76, fetched_at: "2026-10-03T00:00:00.000Z" },
      { symbol: "USOIL", price: 80, fetched_at: "2026-10-14T00:00:00.000Z" },
    ];
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const res = await callGet(
      makeDeps(
        { executions: 0 },
        {
          signal,
          rawEvents: [],
          priceRows,
          rpcMode: "ok",
          rpcCalls,
        },
      ),
    );
    assert.equal(res.status, 200);
    const args = rpcCalls[0].args;
    assert.deepEqual(args.p_raw_event_ids, []);
    assert.equal(args.p_fallback_report_at, "2026-10-01T00:00:00.000Z");
    assert.equal(args.p_flagged_at, "2026-10-05T10:54:14.000Z");
    const body = await res.json();
    assert.equal(body.pricesAtSignal[0].priceAtSignal, 70);
    assert.equal(body.pricesAtSignal[0].priceAtSignalDate, "2026-10-01T00:00:00.000Z");
    assert.equal(body.pricesAtSignal[0].priceAtFlagged, 76);
  });

  await runTest("an earlier raw event date is the report time", async () => {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const res = await callGet(
      makeDeps(
        { executions: 0 },
        {
          signal: sharedSignal,
          rawEvents: sharedRawEvents,
          priceRows: sharedPriceRows,
          rpcMode: "ok",
          rpcCalls,
        },
      ),
    );
    assert.equal(res.status, 200);
    const args = rpcCalls[0].args;
    assert.deepEqual(args.p_raw_event_ids, ["re-late", "re-early", "re-bad"]);
    assert.equal(args.p_fallback_report_at, "2026-10-05T12:00:00.000Z");
    const body = await res.json();
    assert.equal(body.pricesAtSignal[0].priceAtSignal, 72);
    assert.equal(body.pricesAtSignal[0].priceAtSignalDate, "2026-10-04T20:13:41.000Z");
    assert.notEqual(body.pricesAtSignal[0].priceAtSignal, 74);
  });
}

void main();
