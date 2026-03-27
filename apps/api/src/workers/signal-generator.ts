import { Worker } from "bullmq";

import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { QUEUE_NAMES } from "../queues.js";
import { ClaudeService } from "../services/claude.service.js";

export function startSignalGeneratorWorker() {
  const connection = getRedis();
  if (!connection) {
    console.warn("⚠️ [Signal Generator] Redis connection missing. Worker not started.");
    return null;
  }
  const supabase = getSupabaseAdmin();
  const claude = new ClaudeService();

  const worker = new Worker(
    QUEUE_NAMES.signalGeneration,
    async (job) => {
      const signalId = job.data?.signalId as string | undefined;
      if (!signalId) throw new Error("Missing signalId");

      const { data: signal, error } = await supabase.from("signals").select("*").eq("id", signalId).maybeSingle();
      if (error || !signal) throw new Error("signal not found");

      // Phase 8 full context enrichment (ACLED/NewsAPI/sanctions/shipping) plugs in here.
      const analysis = await claude.generateAnalysis(signal, { contextNotes: [] });

      const { error: upErr } = await supabase
        .from("signals")
        .update({ ai_analysis: analysis, updated_at: new Date().toISOString() })
        .eq("id", signalId);
      if (upErr) throw new Error("Failed to update ai_analysis");

      return { ok: true };
    },
    { connection, concurrency: 2 },
  );

  return worker;
}

