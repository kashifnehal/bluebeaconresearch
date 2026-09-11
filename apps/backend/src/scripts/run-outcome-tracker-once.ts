/**
 * Manual one-off trigger for #121's outcome-tracker worker — used for the initial
 * historical backfill (Step 3) so signal_outcomes is populated immediately rather
 * than trickling in only from the daily cron (see workers.ts, "0 5 * * *"). Safe to
 * re-run: the worker only ever processes (signal, asset) pairs with no existing
 * signal_outcomes row.
 *
 * Usage: pnpm --filter backend run outcome-tracker:once
 */
import { getEnv } from "../env.js";
import { runOutcomeTrackerOnce } from "../workers/outcome-tracker.js";

async function main() {
  getEnv();
  const result = await runOutcomeTrackerOnce();
  console.log("[run-outcome-tracker-once] result:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[run-outcome-tracker-once] fatal:", err);
  process.exit(1);
});
