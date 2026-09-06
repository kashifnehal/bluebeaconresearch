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
import {
  buildPipelineStatus,
  recordPipelineRun,
  markCollectorsAlerted,
  type PipelineRunStatus,
} from "./lib/pipeline-status.js";
import { getLastKnownRedisUsage } from "./clients/redis.js";

// Consecutive-failed-run thresholds before a collector going silent pages someone.
// GDELT: 8 runs (~4h at */30). A single GDELT 429 is an expected IP-level block on
// the shared Railway egress and clears on its own within a cycle or two; only a
// genuinely stuck feed (hours of continuous failure) is worth a page, and it's
// filed as a warning, not an error (see severity below). GNews: ~2h — wider because
// free-tier quota gaps (#64) are expected and shouldn't page. RSS: 2 runs with >50%
// of feeds failing — the check that would have caught #63 (13/14 feeds dead) on day
// one instead of 16 days in.
const COLLECTOR_ALERT_THRESHOLDS: Record<string, number> = {
  gdelt: 8,
  gnews: 8,
  rss: 2,
};

// GDELT failure is routinely an upstream IP block, not our bug — file it below
// "error" so it doesn't page. The other collectors going silent is a real regression.
const COLLECTOR_ALERT_SEVERITY: Record<string, Sentry.SeverityLevel> = {
  gdelt: "warning",
};

/**
 * Fires one Sentry alert per collector per threshold-crossing (dedup via the
 * persisted `alerted` flag, which recordPipelineRun clears on recovery). Returns
 * the collector keys that just alerted so the caller can persist that.
 */
function evaluateCollectorHealth(status: PipelineRunStatus): string[] {
  const consecutiveFailures = status.consecutiveFailures ?? {};
  const alerted = status.alerted ?? {};
  const newlyAlerted: string[] = [];

  for (const [key, threshold] of Object.entries(COLLECTOR_ALERT_THRESHOLDS)) {
    const count = consecutiveFailures[key] ?? 0;
    if (count < threshold || alerted[key]) continue;

    const lastError = status.collectors[key as keyof PipelineRunStatus["collectors"]]?.error ?? "(no error string captured)";
    const lastSuccess = status.lastSuccessAt?.[key] ?? "not within the retained window";
    const msg =
      `[ingestion] collector "${key}" has failed ${count} consecutive run(s) ` +
      `(alert threshold ${threshold}). Last successful run: ${lastSuccess}. Last error: ${lastError}`;
    console.error(msg);
    Sentry.captureMessage(msg, COLLECTOR_ALERT_SEVERITY[key] ?? "error");
    newlyAlerted.push(key);
  }
  return newlyAlerted;
}

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

  const recorded = await recordPipelineRun(buildPipelineStatus(collectors));
  try {
    const newlyAlerted = evaluateCollectorHealth(recorded);
    if (newlyAlerted.length > 0) await markCollectorsAlerted(newlyAlerted);
  } catch (e) {
    console.error("[workers] collector-health alerting failed:", e instanceof Error ? e.message : e);
  }
  return collectors;
}

async function main() {
  getEnv();

  if (process.env.SENTRY_DSN) {
    Sentry.init({ dsn: process.env.SENTRY_DSN });
  }

  // Use Fastify logger (but do not listen).
  const app = buildApp();

  // Dormant scaffolding: per ADR 006 (10_DECISIONS.md), the real collectors
  // (rss/gnews/gdelt) classify and insert signals directly to Supabase, bypassing
  // BullMQ entirely — see the "Dormant BullMQ path" comments in ai-classifier.ts,
  // signal-generator.ts, and alert-dispatcher.ts. With nothing ever enqueuing jobs,
  // these three Workers still poll Redis continuously just to stay alive (lock
  // renewal, stalled-job checks) — a flat, constant Upstash cost regardless of user
  // count. Gated off by default so that idle cost doesn't recur; flip
  // ENABLE_BULLMQ_WORKERS=true if/when the system moves back to a queued pipeline.
  const workersEnabled = (process.env.ENABLE_BULLMQ_WORKERS || "false").toLowerCase() === "true";
  let workers: Array<ReturnType<typeof startAiClassifierWorker>> = [];
  if (workersEnabled) {
    workers = [
      startAiClassifierWorker(),
      startSignalGeneratorWorker(),
      startAlertDispatcherWorker(),
    ];
  } else {
    app.log.info("workers: BullMQ workers disabled (ENABLE_BULLMQ_WORKERS not set) — dormant scaffolding skipped");
  }

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

    // Reactive Redis-quota check, piggybacked on the existing heartbeat rather than a
    // separate cron. Upstash doesn't expose usage proactively through the credentials
    // this project has (see clients/redis.ts) — this only knows the real Limit/Usage
    // numbers once a command has actually failed against the quota, parsed straight out
    // of Upstash's own error string. Real proactive (pre-failure) 70%/90% checks need
    // UPSTASH_API_KEY + UPSTASH_EMAIL wired to Upstash's account-level Management API —
    // not present today; this is the best signal available without those.
    const usage = getLastKnownRedisUsage();
    if (usage) {
      const pct = usage.usage / usage.limit;
      const ageMin = (Date.now() - usage.at) / 60_000;
      if (pct >= 0.9) {
        app.log.error(
          { usage, ageMin: Math.round(ageMin * 10) / 10 },
          `[REDIS QUOTA] 90%+ of Upstash quota used (${usage.usage}/${usage.limit}), last confirmed ${ageMin.toFixed(1)}min ago`,
        );
      } else if (pct >= 0.7) {
        app.log.warn(
          { usage, ageMin: Math.round(ageMin * 10) / 10 },
          `[REDIS QUOTA] 70%+ of Upstash quota used (${usage.usage}/${usage.limit}), last confirmed ${ageMin.toFixed(1)}min ago`,
        );
      }
    }
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

