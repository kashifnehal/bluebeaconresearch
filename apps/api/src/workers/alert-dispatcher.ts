import { Worker } from "bullmq";

import { getRedis } from "../clients/redis";
import { getSupabaseAdmin } from "../clients/supabase";
import { QUEUE_NAMES } from "../queues";

export function startAlertDispatcherWorker() {
  const connection = getRedis();
  const supabase = getSupabaseAdmin();

  const worker = new Worker(
    QUEUE_NAMES.alertDispatcher,
    async (job) => {
      const signalId = job.data?.signalId as string | undefined;
      if (!signalId) throw new Error("Missing signalId");

      const { data: signal, error } = await supabase.from("signals").select("*").eq("id", signalId).maybeSingle();
      if (error || !signal) throw new Error("signal not found");

      // Phase 8: full dispatch (telegram/email/slack/webhooks) with quiet-hours + rule matching.
      // For now, we only record a synthetic "queued" alert for matching rules to keep the pipeline linked.
      const { data: rules, error: rulesErr } = await supabase
        .from("alert_rules")
        .select("*")
        .eq("is_active", true)
        .lte("min_severity", signal.severity);
      if (rulesErr) return { queued: 0 };

      const rows = (rules ?? []).map((r) => ({
        user_id: r.user_id,
        rule_id: r.id,
        signal_id: signalId,
        channel: "queued",
        status: "queued",
      }));

      if (rows.length) await supabase.from("alerts_sent").insert(rows);

      return { queued: rows.length };
    },
    { connection, concurrency: 10 },
  );

  return worker;
}

