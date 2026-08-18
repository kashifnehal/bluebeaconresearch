import { Worker } from "bullmq";

import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { QUEUE_NAMES } from "../queues.js";
import { ClaudeService } from "../services/claude.service.js";

const supabase = getSupabaseAdmin();
const claude = new ClaudeService();

/**
 * Generates the full analyst briefing (signals.ai_analysis) for a severity >=7
 * signal. Extracted 2026-08-18 — identical dormant-queue problem alert-dispatch had:
 * this was only ever enqueued from ai-classifier.ts's queue-consumer path, which
 * nothing feeds (see alert-dispatcher.ts's history). Confirmed live: 423 signals with
 * severity >=7 in the DB, 0 with a non-null ai_analysis. Called inline (no queue) from
 * each collector right after a severity >=7 signal is inserted, same pattern as
 * dispatchAlertsForSignal.
 */
export async function generateSignalAnalysis(signalId: string) {
  const { data: signal, error } = await supabase.from("signals").select("*").eq("id", signalId).maybeSingle();
  if (error || !signal) throw new Error("signal not found");

  const analysis = await claude.generateAnalysis(signal, { contextNotes: [] });

  const { error: upErr } = await supabase
    .from("signals")
    .update({ ai_analysis: analysis, updated_at: new Date().toISOString() })
    .eq("id", signalId);
  if (upErr) throw new Error("Failed to update ai_analysis");

  return { ok: true };
}

// ── Dormant BullMQ path ──────────────────────────────────────────────────────
// Same status as alert-dispatcher.ts's queue: nothing currently enqueues jobs onto
// `signal-generation` in the live path. Kept in place, not deleted, as a reserved
// option for a future move back to a queued model.
export function startSignalGeneratorWorker() {
  const connection = getRedis();
  if (!connection) {
    console.warn("⚠️ [Signal Generator] Redis connection missing. Worker not started.");
    return null;
  }

  const worker = new Worker(
    QUEUE_NAMES.signalGeneration,
    async (job) => {
      const signalId = job.data?.signalId as string | undefined;
      if (!signalId) throw new Error("Missing signalId");
      return generateSignalAnalysis(signalId);
    },
    { connection, concurrency: 2 },
  );

  return worker;
}
