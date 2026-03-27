import { Worker } from "bullmq";
import axios from "axios";

import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { QUEUE_NAMES } from "../queues.js";
import { TelegramService } from "../services/telegram.service.js";
import { ExpoPushService } from "../services/expo-push.service.js";

export function startAlertDispatcherWorker() {
  const connection = getRedis();
  if (!connection) {
    console.warn("⚠️ [Alert Dispatcher] Redis connection missing. Worker not started.");
    return null;
  }
  const supabase = getSupabaseAdmin();
  const telegram = new TelegramService();
  const expoPush = new ExpoPushService();

  const worker = new Worker(
    QUEUE_NAMES.alertDispatcher,
    async (job) => {
      const signalId = job.data?.signalId as string | undefined;
      if (!signalId) throw new Error("Missing signalId");

      const { data: signal, error } = await supabase.from("signals").select("*").eq("id", signalId).maybeSingle();
      if (error || !signal) throw new Error("signal not found");

      const { data: rules, error: rulesErr } = await supabase
        .from("alert_rules")
        .select("*")
        .eq("is_active", true)
        .lte("min_severity", signal.severity);
      if (rulesErr) return { queued: 0 };

      const commodityAssets = Array.isArray(signal.commodity_impacts)
        ? (signal.commodity_impacts as Array<{ asset?: string }>).map((c) => c.asset).filter(Boolean)
        : [];

      let attempted = 0;
      let delivered = 0;

      for (const rule of rules ?? []) {
        // Region filter (empty = all)
        if (Array.isArray(rule.regions) && rule.regions.length) {
          if (!rule.regions.includes(signal.region)) continue;
        }
        // Commodity filter (empty = all)
        if (Array.isArray(rule.commodities) && rule.commodities.length) {
          const ok = commodityAssets.some((a) => rule.commodities.includes(a));
          if (!ok) continue;
        }

        // Load user profile + preferences for quiet hours and email.
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, plan_tier")
          .eq("id", rule.user_id)
          .maybeSingle();
        const { data: prefs } = await supabase
          .from("user_preferences")
          .select("quiet_start, quiet_end, timezone")
          .eq("user_id", rule.user_id)
          .maybeSingle();

        // Quiet hours check (UTC only for now). Severity 10 bypass.
        if (signal.severity !== 10 && prefs?.quiet_start && prefs?.quiet_end) {
          const now = new Date();
          const hhmm = now.toISOString().slice(11, 16); // "HH:MM"
          const start = String(prefs.quiet_start).slice(0, 5);
          const end = String(prefs.quiet_end).slice(0, 5);
          const inRange =
            start < end ? hhmm >= start && hhmm <= end : hhmm >= start || hhmm <= end; // handles overnight windows
          if (inRange) continue;
        }

        const channels: string[] = Array.isArray(rule.channels) ? rule.channels : ["telegram"];
        for (const channel of channels) {
          attempted += 1;
          let status: "queued" | "delivered" | "failed" = "queued";

          try {
            // Load connected channels for the user
            const { data: channelsRow } = await supabase
              .from("user_channels")
              .select("telegram_chat_id, slack_webhook_url")
              .eq("user_id", rule.user_id)
              .maybeSingle();

            if (channel === "telegram") {
              if (!channelsRow?.telegram_chat_id) {
                status = "queued";
              } else {
                await telegram.sendMessage(
                  channelsRow.telegram_chat_id,
                  `Blue Beacon (${signal.severity}/10) — ${signal.title}\n\n${signal.summary}`,
                );
                status = "delivered";
              }
            } else if (channel === "slack") {
              if (!channelsRow?.slack_webhook_url) {
                status = "queued";
              } else {
                await axios.post(
                  channelsRow.slack_webhook_url,
                  { text: `Blue Beacon Research (${signal.severity}/10) — ${signal.title}\n${signal.summary}` },
                  { timeout: 10_000 },
                );
                status = "delivered";
              }
            } else if (channel === "webhook") {
              const { data: hooks } = await supabase
                .from("webhook_endpoints")
                .select("*")
                .eq("user_id", rule.user_id)
                .eq("is_active", true);
              for (const hook of hooks ?? []) {
                const start = Date.now();
                try {
                  const resp = await axios.post(hook.url, signal, { timeout: 10_000 });
                  await supabase.from("webhook_deliveries").insert({
                    endpoint_id: hook.id,
                    signal_id: signalId,
                    payload: signal,
                    status_code: resp.status,
                    response_body: typeof resp.data === "string" ? resp.data.slice(0, 2000) : JSON.stringify(resp.data).slice(0, 2000),
                    attempt_count: 1,
                    delivered_at: new Date().toISOString(),
                  });
                  await supabase.from("webhook_endpoints").update({ last_success_at: new Date().toISOString() }).eq("id", hook.id);
                  status = "delivered";
                } catch (e) {
                  await supabase.from("webhook_deliveries").insert({
                    endpoint_id: hook.id,
                    signal_id: signalId,
                    payload: signal,
                    status_code: 0,
                    response_body: e instanceof Error ? e.message : "failed",
                    attempt_count: 1,
                  });
                  status = "failed";
                } finally {
                  void start;
                }
              }
            }

            // Push notifications for any user with tokens (best-effort)
            const { data: tokenProfile } = await supabase
              .from("profiles")
              .select("push_tokens")
              .eq("id", rule.user_id)
              .maybeSingle();
            const tokens = (tokenProfile?.push_tokens ?? []) as string[];
            for (const t of tokens) {
              try {
                await expoPush.send(t, signal.title, signal.summary, { signalId });
              } catch {
                // ignore
              }
            }

            if (status === "delivered") delivered += 1;
          } catch {
            status = "failed";
          }

          await supabase.from("alerts_sent").insert({
            user_id: rule.user_id,
            rule_id: rule.id,
            signal_id: signalId,
            channel,
            status,
            delivered_at: status === "delivered" ? new Date().toISOString() : null,
          });
        }

        // Update last triggered timestamp once per rule
        await supabase.from("alert_rules").update({ last_triggered_at: new Date().toISOString() }).eq("id", rule.id);
      }

      return { attempted, delivered };
    },
    { connection, concurrency: 10 },
  );

  return worker;
}

