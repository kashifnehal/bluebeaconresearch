import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { parsePriceHistoryPoints, sparklineDisplayState, withPreselect } from "./WatchlistClient";

// WatchlistClient renders inside next/navigation's useSearchParams, which
// throws outside a mounted App Router — renderToStaticMarkup can't exercise
// the component in this plain-node test runner (same constraint documented
// in components/layout/Sidebar.test.tsx). The pure display-state/parsing
// logic is extracted and tested directly instead; the hydration/skeleton
// wiring itself is asserted against the source text below.

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

runTest("sparklineDisplayState shows loading first, regardless of error/points", () => {
  assert.equal(sparklineDisplayState(true, true, 0), "loading");
});

runTest("sparklineDisplayState shows error for a failed request, even with cached points", () => {
  assert.equal(sparklineDisplayState(false, true, 10), "error");
});

runTest("sparklineDisplayState shows insufficient only on a successful response with <2 points", () => {
  assert.equal(sparklineDisplayState(false, false, 1), "insufficient");
  assert.equal(sparklineDisplayState(false, false, 0), "insufficient");
});

runTest("sparklineDisplayState shows the chart once loaded, not errored, with >=2 points", () => {
  assert.equal(sparklineDisplayState(false, false, 2), "chart");
});

runTest("parsePriceHistoryPoints throws on a non-ok response, even with points present", () => {
  assert.throws(() => parsePriceHistoryPoints(false, { points: [{ price: 1, fetchedAt: "2026-01-01" }] }));
});

runTest("parsePriceHistoryPoints throws when the body carries an error object", () => {
  assert.throws(() =>
    parsePriceHistoryPoints(true, { points: [], error: { code: "db_error", message: "db_error" } }),
  );
});

runTest("parsePriceHistoryPoints returns points on a clean success", () => {
  const points = [{ price: 10, fetchedAt: "2026-01-01" }];
  assert.deepEqual(parsePriceHistoryPoints(true, { points }), points);
});

runTest("withPreselect adds a symbol not already in the list", () => {
  assert.deepEqual(withPreselect(["USOIL"], "GOLD"), ["USOIL", "GOLD"]);
});

runTest("withPreselect is a no-op when the symbol is already present or there is none", () => {
  assert.deepEqual(withPreselect(["USOIL"], "USOIL"), ["USOIL"]);
  assert.deepEqual(withPreselect(["USOIL"], null), ["USOIL"]);
});

const dir = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(dir, "WatchlistClient.tsx"), "utf8");

runTest("watch/isSuggested initial state does not read localStorage during render (no hydration mismatch)", () => {
  const watchInit = source.match(/const \[watch, setWatch\] = useState<string\[\]>\(([^)]*)\)/);
  const suggestedInit = source.match(/const \[isSuggested, setIsSuggested\] = useState\(([^)]*)\)/);
  assert.ok(watchInit && suggestedInit, "expected to find the watch/isSuggested useState calls");
  assert.doesNotMatch(watchInit![1], /readStoredWatchlist/);
  assert.doesNotMatch(suggestedInit![1], /readStoredWatchlist/);
});

runTest("readStoredWatchlist is only called inside the hydration effect", () => {
  // Both useState initializers were already asserted clean above; this
  // confirms every remaining call site sits after the hydration effect opens
  // (`if (hydrated || !isFetched) return;`), not back up near the initial state.
  const hydrationGuardIndex = source.indexOf("if (hydrated || !isFetched) return;");
  assert.ok(hydrationGuardIndex > -1, "expected to find the hydration effect's early-return guard");
  // `readStoredWatchlist();` (a call) vs `readStoredWatchlist(): StoredWatchlist` (the
  // function's own declaration, which naturally sits above everything else).
  const callIndexes = [...source.matchAll(/readStoredWatchlist\(\);/g)].map((m) => m.index!);
  assert.ok(callIndexes.length > 0, "expected at least one readStoredWatchlist() call");
  for (const idx of callIndexes) {
    assert.ok(idx > hydrationGuardIndex, "readStoredWatchlist() must only be called after the hydration guard");
  }
});

runTest("the card grid is gated behind `hydrated`, with a skeleton shown otherwise", () => {
  assert.match(source, /!hydrated \? \(/);
  assert.match(source, /data-testid="watchlist-grid-skeleton"/);
});

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

// The hydration effect in WatchlistClient only runs once `isFetched` from
// useMyPreferences() is true — if a failed preferences fetch never set
// isFetched, a logged-in user whose prefs query errors would be stuck behind
// the skeleton forever (#89's prefs read is RLS-scoped and can legitimately
// fail transiently). This isn't WatchlistClient's own logic — it's a
// react-query guarantee the hydration effect depends on — so it's verified
// directly against react-query's QueryObserver rather than re-implemented.
void runAsync("a failing query still reports isFetched: true once settled", async () => {
  const client = new QueryClient();
  const observer = new QueryObserver(client, {
    queryKey: ["my-preferences-test"],
    queryFn: () => Promise.reject(new Error("boom")),
    retry: false,
  });

  await new Promise<void>((resolve, reject) => {
    const unsubscribe = observer.subscribe((result) => {
      if (result.isFetched) {
        unsubscribe();
        try {
          assert.equal(result.isError, true);
          resolve();
        } catch (err) {
          reject(err);
        }
      }
    });
  });

  observer.destroy();
  client.clear();
});
