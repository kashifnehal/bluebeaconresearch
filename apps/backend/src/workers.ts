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
import { runPriceSyncOnce } from "./workers/price-syncer.js";
import { runSanctionsSyncOnce } from "./workers/sanctions-syncer.js";

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

  cron.schedule("*/15 * * * *", async () => {
    try {
      const res = await runGdeltCollectorOnce();
      app.log.info({ res }, "gdelt-collector");
    } catch (e) {
      app.log.error({ err: e }, "gdelt-collector failed");
      Sentry.captureException(e);
    }
    try {
      const res = await runAcledCollectorOnce();
      app.log.info({ res }, "acled-collector");
    } catch (e) {
      app.log.error({ err: e }, "acled-collector failed");
      Sentry.captureException(e);
    }
    try {
      const res = await runGnewsCollectorOnce();
      app.log.info({ res }, "gnews-collector");
    } catch (e) {
      app.log.error({ err: e }, "gnews-collector failed");
      Sentry.captureException(e);
    }
  });

  cron.schedule("*/15 * * * *", async () => {
    try {
      const res = await runPriceSyncOnce();
      app.log.info({ res }, "price-sync");
    } catch (e) {
      app.log.error({ err: e }, "price-sync failed");
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

