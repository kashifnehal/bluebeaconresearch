import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import type { OutcomeRowsObservation } from "@/lib/signal-outcomes-server";
import type { BaselineFetchTiming, PricePointsTiming } from "@/lib/price-baseline-server";
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
      builder.select = (cols?: string) => {
        if (table === "raw_events" && typeof cols === "string" && options?.rawSelect) {
          options.rawSelect.value = cols;
        }
        return builder;
      };
      builder.eq = self;
      builder.neq = self;
      builder.or = self;
      builder.in = self;
      builder.gte = self;
      builder.lte = (column: string, value: string) => {
        if (table === "commodity_prices" && column === "fetched_at" && options?.priceLte) {
          options.priceLte.push(value);
        }
        return builder;
      };
      builder.order = self;
      builder.limit = self;
      builder.maybeSingle = () => {
        counter.executions += 1;
        if (table === "signals") return Promise.resolve({ data: signal, error: null });
        if (table === "commodity_prices") {
          return Promise.resolve({
            data: { price: 71.2, fetched_at: "2026-10-14T00:00:00.000Z" },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
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
        const data = table === "raw_events" ? rawEvents : [];
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      };
      return builder;
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
      "2026-10-04T20:13:41.000Z",
      "2026-10-05T10:54:14.000Z",
    ]);
    assert.equal(body.pricesAtSignal[0].priceAtFlaggedDate, "2026-10-14T00:00:00.000Z");
  });
}

void main();
