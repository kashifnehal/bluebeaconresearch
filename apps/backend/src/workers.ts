import cron from "node-cron";
import * as Sentry from "@sentry/node";

import { buildApp } from "./app.js";
import { getEnv } from "./env.js";
import { startAiClassifierWorker } from "./workers/ai-classifier.js";
import { startSignalGeneratorWorker } from "./workers/signal-generator.js";
import { startAlertDispatcherWorker } from "./workers/alert-dispatcher.js";
import { runGdeltCollectorOnce } from "./workers/gdelt-collector.js";
import { runAcledCollectorOnce } from "./workers/acled-collector.js";
import { runGnewsCollectorOnce } from "./workers/gnews-collector.js";
import { runRssCollectorOnce } from "./workers/rss-collector.js";
import { runPriceSyncOnce } from "./workers/price-syncer.js";
import { runSanctionsSyncOnce } from "./workers/sanctions-syncer.js";
import { reconcileOrphanedRawEventsOnce } from "./workers/reconciliation.js";
import { buildPipelineStatus, recordPipelineRun } from "./lib/pipeline-status.js";

function isWorkersEntrypoint() {
  const entry = process.argv[1] ?? "";
  return /[/\\]workers\.(ts|js)$/.test(entry);
}

// Pre-launch, this runs 24/7 with zero real user traffic — pure fixed Railway cost for
// no current benefit. Configurable via env so the interval can be widened now (e.g.
// "*/30 * * * *" or hourly) without a redeploy, and tightened back to 15 min for launch
// the same way. Default matches the existing always-on behavior unless overridden.
const DEFAULT_INGESTION_CRON = "*/15 * * * *";
const INGESTION_CRON =
  process.env.INGESTION_INTERVAL_CRON && cron.validate(process.env.INGESTION_INTERVAL_CRON)
    ? process.env.INGESTION_INTERVAL_CRON
    : DEFAULT_INGESTION_CRON;

if (process.env.INGESTION_INTERVAL_CRON && INGESTION_CRON !== process.env.INGESTION_INTERVAL_CRON) {
  console.warn(
    `[workers] INGESTION_INTERVAL_CRON="${process.env.INGESTION_INTERVAL_CRON}" is not a valid cron expression — falling back to default "${DEFAULT_INGESTION_CRON}"`,
  );
}

async function runIngestionCycle(app: ReturnType<typeof buildApp>) {
  const [gdelt, gnews, rss, prices] = await Promise.allSettled([
    runGdeltCollectorOnce(),
    runGnewsCollectorOnce(),
    runRssCollectorOnce(),
    runPriceSyncOnce(),
  ]);

  const collectors = {
    gdelt: gdelt.status === "fulfilled" ? gdelt.value : { error: String(gdelt.reason) },
    gnews: gnews.status === "fulfilled" ? gnews.value : { error: String(gnews.reason) },
    rss: rss.status === "fulfilled" ? rss.value : { error: String(rss.reason) },
    prices: prices.status === "fulfilled" ? prices.value : { error: String(prices.reason) },
  };

  await recordPipelineRun(buildPipelineStatus(collectors));
  return collectors;
}

async function main() {
  getEnv();

  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  // Use Fastify logger (but do not listen).
  const app = buildApp();

  const workers = [
    startAiClassifierWorker(),
    startSignalGeneratorWorker(),
    startAlertDispatcherWorker(),
  ];

  // ── Run collectors IMMEDIATELY on startup (don't wait up to 15 min for first cron tick) ──
  // This means after a Railway deploy or restart, data is fresh within ~30 seconds.
  app.log.info("Running initial ingestion immediately on startup...");
  runIngestionCycle(app).then((c) => {
    app.log.info({ collectors: c }, "startup:ingestion complete");
  }).catch(() => {});

  // ── Collect news signals — interval set by INGESTION_INTERVAL_CRON, default 15 min ──
  app.log.info({ schedule: INGESTION_CRON }, "workers: ingestion cron schedule");
  cron.schedule(INGESTION_CRON, async () => {
    try {
      const collectors = await runIngestionCycle(app);
      app.log.info({ collectors }, "ingestion-cycle complete");
    } catch (e) {
      app.log.error({ err: e }, "ingestion-cycle failed");
      Sentry.captureException(e);
    }
    try {
      const res = await runAcledCollectorOnce();
      app.log.info({ result: res }, "acled-collector");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("ACLED credentials missing")) {
        app.log.debug("acled-collector skipped (no credentials)");
      } else {
        app.log.error({ err: e }, "acled-collector failed");
        Sentry.captureException(e);
      }
    }
  });

  // Reconciliation: a transient failure between the raw_events insert and the
  // signals insert can orphan a news item forever, since the dedup check only looks
  // at raw_events.external_id. Every 30 min, catch anything older than the same
  // window with no matching signal and re-attempt classification.
  cron.schedule("*/30 * * * *", async () => {
    try {
      const res = await reconcileOrphanedRawEventsOnce();
      if (res.orphaned > 0) {
        app.log.warn({ res }, "reconciliation: orphaned raw_events found");
      } else {
        app.log.debug({ res }, "reconciliation: no orphans found");
      }
    } catch (e) {
      app.log.error({ err: e }, "reconciliation failed");
      Sentry.captureException(e);
    }
  });

  // Daily sanctions sync at 04:00 UTC
  cron.schedule("0 4 * * *", async () => {
    try {
      const res = await runSanctionsSyncOnce();
      app.log.info({ res }, "sanctions-sync");
    } catch (e) {
      app.log.error({ err: e }, "sanctions-sync failed");
      Sentry.captureException(e);
    }
  });

  // Log heartbeat every 5 min — confirms container stayed alive between cron ticks
  cron.schedule("*/5 * * * *", () => {
    app.log.info({ uptimeSec: Math.round(process.uptime()) }, "workers:heartbeat");
  });

  // Only bind HTTP when run as standalone workers process (Railway workers service).
  // When imported from index.ts alongside server.ts, skip listen to avoid EADDRINUSE on PORT.
  if (isWorkersEntrypoint()) {
    const port = Number(process.env.PORT) || 3001;
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info({ port, service: process.env.RAILWAY_SERVICE_NAME }, "workers: cron schedulers active, health server listening");
  } else {
    app.log.info("workers: cron schedulers active (embedded — no duplicate HTTP listener)");
  }

  const shutdown = async () => {
    app.log.info("Shutting down workers...");
    await Promise.allSettled(workers.map((w) => w?.close()));
    await app.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

