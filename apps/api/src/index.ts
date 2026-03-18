import cron from "node-cron";
import * as Sentry from "@sentry/node";

import { buildApp } from "./app";
import { getEnv } from "./env";
import { startAiClassifierWorker } from "./workers/ai-classifier";
import { startSignalGeneratorWorker } from "./workers/signal-generator";
import { startAlertDispatcherWorker } from "./workers/alert-dispatcher";
import { runGdeltCollectorOnce } from "./workers/gdelt-collector";
import { runPriceSyncOnce } from "./workers/price-syncer";

async function main() {
  const env = getEnv();

  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  const app = buildApp();
  const workers = [
    startAiClassifierWorker(),
    startSignalGeneratorWorker(),
    startAlertDispatcherWorker(),
  ];

  // Cron jobs (collector + price sync). These are safe to run in a single "workers" process in Railway.
  cron.schedule("*/15 * * * *", async () => {
    try {
      const res = await runGdeltCollectorOnce();
      app.log.info({ res }, "gdelt-collector");
    } catch (e) {
      app.log.error({ err: e }, "gdelt-collector failed");
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

  const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`API listening on ${address}`);

  const shutdown = async () => {
    app.log.info("Shutting down...");
    await Promise.allSettled(workers.map((w) => w.close()));
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

