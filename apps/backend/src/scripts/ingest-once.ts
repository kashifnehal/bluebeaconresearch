/**
 * One-shot ingestion run for Railway cron or manual triggers.
 * Runs all collectors once and exits (no long-lived process required).
 */
import { getEnv } from "../env.js";
import { runGdeltCollectorOnce } from "../workers/gdelt-collector.js";
import { runGnewsCollectorOnce } from "../workers/gnews-collector.js";
import { runRssCollectorOnce } from "../workers/rss-collector.js";
import { runPriceSyncOnce } from "../workers/price-syncer.js";

async function main() {
  getEnv();
  console.log("[ingest-once] starting collectors...");

  const [gdelt, gnews, rss, prices] = await Promise.allSettled([
    runGdeltCollectorOnce(),
    runGnewsCollectorOnce(),
    runRssCollectorOnce(),
    runPriceSyncOnce(),
  ]);

  const summary = {
    gdelt: gdelt.status === "fulfilled" ? gdelt.value : { error: String(gdelt.reason) },
    gnews: gnews.status === "fulfilled" ? gnews.value : { error: String(gnews.reason) },
    rss: rss.status === "fulfilled" ? rss.value : { error: String(rss.reason) },
    prices: prices.status === "fulfilled" ? prices.value : { error: String(prices.reason) },
    finishedAt: new Date().toISOString(),
  };

  console.log("[ingest-once] done:", JSON.stringify(summary));
}

main().catch((e) => {
  console.error("[ingest-once] fatal:", e);
  process.exit(1);
});
