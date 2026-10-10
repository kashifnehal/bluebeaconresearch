import assert from "node:assert/strict";

import {
  fetchMatchedBaselines,
  fetchMatchedBaselinesWithTimeout,
} from "./price-baseline-server";
import type { RouteSupabaseClients } from "./supabase-server";

function runTest(name: string, fn: () => Promise<void> | void) {
  return (async () => {
    try {
      await fn();
      console.log(`✔ ${name}`);
    } catch (err) {
      console.error(`✖ ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  })();
}

type FakeRow = { price: number; fetched_at: string };

/** A chainable fake matching .from().select().eq().order().range() usage,
 * pulling one page of `pages` per range() call. */
function makeFakeSupabase(pages: FakeRow[][], opts?: { errorOnPage?: number }) {
  let rangeCalls = 0;
  const client = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        range() {
          const pageIndex = rangeCalls;
          rangeCalls += 1;
          if (opts?.errorOnPage === pageIndex) {
            return Promise.resolve({ data: null, error: { message: "boom" } });
          }
          return Promise.resolve({ data: pages[pageIndex] ?? [], error: null });
        },
      };
    },
  };
  return { client, getRangeCalls: () => rangeCalls };
}

function makeNeverResolvingSupabase() {
  const client = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        range() {
          return new Promise(() => {});
        },
      };
    },
  };
  return client;
}

async function main() {
  await runTest(
    "a single asset reads commodity_prices once total across all window lengths, not once per window length",
    async () => {
      const { client, getRangeCalls } = makeFakeSupabase([
        [
          { price: 100, fetched_at: "2026-01-01T00:00:00Z" },
          { price: 110, fetched_at: "2026-01-02T00:00:00Z" },
        ],
      ]);

      await fetchMatchedBaselines(
        client as unknown as RouteSupabaseClients["supabase"],
        ["ASSET_WINDOWS"],
        [],
      );

      assert.equal(getRangeCalls(), 1);
    },
  );

  await runTest(
    "two simultaneous calls for the same asset share one read",
    async () => {
      const { client, getRangeCalls } = makeFakeSupabase([
        [{ price: 100, fetched_at: "2026-01-01T00:00:00Z" }],
      ]);

      const p1 = fetchMatchedBaselines(
        client as unknown as RouteSupabaseClients["supabase"],
        ["ASSET_SHARED"],
        [],
      );
      const p2 = fetchMatchedBaselines(
        client as unknown as RouteSupabaseClients["supabase"],
        ["ASSET_SHARED"],
        [],
      );

      await Promise.all([p1, p2]);
      assert.equal(getRangeCalls(), 1);
    },
  );

  await runTest("an error is not cached and the next call reads again", async () => {
    const { client, getRangeCalls } = makeFakeSupabase([], { errorOnPage: 0 });

    await fetchMatchedBaselines(
      client as unknown as RouteSupabaseClients["supabase"],
      ["ASSET_ERROR"],
      [],
    );
    assert.equal(getRangeCalls(), 1);

    await fetchMatchedBaselines(
      client as unknown as RouteSupabaseClients["supabase"],
      ["ASSET_ERROR"],
      [],
    );
    assert.equal(getRangeCalls(), 2);
  });

  await runTest(
    "the timeout helper returns the empty result when the fetch is slow",
    async () => {
      const realSetTimeout = global.setTimeout;
      const realClearTimeout = global.clearTimeout;
      // Fake timer: fire the timeout callback immediately instead of waiting
      // out the real delay, so the test proves the race logic without sleeping.
      global.setTimeout = ((cb: (...args: unknown[]) => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout;
      global.clearTimeout = (() => {}) as typeof clearTimeout;

      try {
        const result = await fetchMatchedBaselinesWithTimeout(
          makeNeverResolvingSupabase() as unknown as RouteSupabaseClients["supabase"],
          ["ASSET_TIMEOUT"],
          [],
          5000,
        );
        assert.deepEqual(result, {});
      } finally {
        global.setTimeout = realSetTimeout;
        global.clearTimeout = realClearTimeout;
      }
    },
  );
}

void main();
