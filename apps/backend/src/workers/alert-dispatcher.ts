import { Worker } from "bullmq";
import axios from "axios";

import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { QUEUE_NAMES } from "../queues.js";
import { TelegramService } from "../services/telegram.service.js";
import { ExpoPushService } from "../services/expo-push.service.js";

const supabase = getSupabaseAdmin();
const telegram = new TelegramService();
const expoPush = new ExpoPushService();

export type EscalationAlertContext = { oldSeverity: number; newSeverity: number };

/**
 * Matches a freshly-inserted (or escalated) signal against active alert_rules and
 * dispatches to each matched rule's configured channels. Called directly (inline, no
 * queue) from each collector right after it inserts a signal — the same "bypass
 * BullMQ" pattern already used for classification, since nothing currently feeds the
 * dormant `alertDispatcher` queue (see startAlertDispatcherWorker below). Batches
 * per-rule lookups (prefs, channels, push tokens, webhook endpoints) instead of
 * querying once per rule/channel.
 *
 * `escalation`, when passed, is the ONLY thing that changes: the outgoing Telegram/
 * Slack text and push title get a distinct "UPDATED: severity X -> Y" framing instead
 * of the default new-signal wording, so a re-alert is never confusable with a
 * first-time alert. Every other part of this function (rule matching, batching,
 * alerts_sent/webhook_deliveries writes, channel iteration) is untouched and shared —
 * this is the same send path, not a parallel one. Omitting the argument (every
 * existing call site) preserves the exact original template byte-for-byte.
 */
export async function dispatchAlertsForSignal(signalId: string, escalation?: EscalationAlertContext) {
  const { data: signal, error } = await supabase.from("signals").select("*").eq("id", signalId).maybeSingle();
  if (error || !signal) throw new Error("signal not found");

  const { data: rules, error: rulesErr } = await supabase
    .from("alert_rules")
    .select("*")
    .eq("is_active", true)
    .lte("min_severity", signal.severity);
  if (rulesErr) return { attempted: 0, delivered: 0 };

  const commodityAssets = Array.isArray(signal.commodity_impacts)
    ? (signal.commodity_impacts as Array<{ asset?: string }>).map((c) => c.asset).filter(Boolean)
    : [];

  const matchedRules = (rules ?? []).filter((rule) => {
    if (Array.isArray(rule.regions) && rule.regions.length) {
      if (!rule.regions.includes(signal.region)) return false;
    }
    if (Array.isArray(rule.commodities) && rule.commodities.length) {
      const ok = commodityAssets.some((a) => rule.commodities.includes(a));
      if (!ok) return false;
    }
    return true;
  });

  if (matchedRules.length === 0) return { attempted: 0, delivered: 0 };

  const messagePrefix = escalation
    ? `Blue Beacon UPDATED (${escalation.oldSeverity} → ${escalation.newSeverity}/10)`
    : `Blue Beacon (${signal.severity}/10)`;
  const slackMessagePrefix = escalation
    ? `Blue Beacon Research UPDATED (${escalation.oldSeverity} → ${escalation.newSeverity}/10)`
    : `Blue Beacon Research (${signal.severity}/10)`;

  const userIds = [...new Set(matchedRules.map((r) => r.user_id as string))];
  const webhookUserIds = [
    ...new Set(
      matchedRules
        .filter((r) => (Array.isArray(r.channels) ? r.channels : ["telegram"]).includes("webhook"))
        .map((r) => r.user_id as string),
    ),
  ];

  const [{ data: prefsRows }, { data: channelsRows }, { data: profileRows }, { data: webhookRows }] =
    await Promise.all([
      supabase.from("user_preferences").select("user_id, quiet_start, quiet_end, timezone").in("user_id", userIds),
      supabase.from("user_channels").select("user_id, telegram_chat_id, slack_webhook_url").in("user_id", userIds),
      supabase.from("profiles").select("id, push_tokens").in("id", userIds),
      webhookUserIds.length
        ? supabase.from("webhook_endpoints").select("*").in("user_id", webhookUserIds).eq("is_active", true)
        : Promise.resolve({ data: [] as any[] }),
    ]);

  const prefsByUser = new Map((prefsRows ?? []).map((p) => [p.user_id, p]));
  const channelsByUser = new Map((channelsRows ?? []).map((c) => [c.user_id, c]));
  const pushTokensByUser = new Map((profileRows ?? []).map((p) => [p.id, (p.push_tokens ?? []) as string[]]));
  const webhooksByUser = new Map<string, any[]>();
  for (const hook of webhookRows ?? []) {
    const list = webhooksByUser.get(hook.user_id) ?? [];
    list.push(hook);
    webhooksByUser.set(hook.user_id, list);
  }

  let attempted = 0;
  let delivered = 0;
  const alertsSentRows: Record<string, unknown>[] = [];
  const triggeredRuleIds: string[] = [];

  for (const rule of matchedRules) {
    const prefs = prefsByUser.get(rule.user_id);
    if (signal.severity !== 10 && prefs?.quiet_start && prefs?.quiet_end) {
      const now = new Date();
      const hhmm = now.toISOString().slice(11, 16); // "HH:MM"
      const start = String(prefs.quiet_start).slice(0, 5);
      const end = String(prefs.quiet_end).slice(0, 5);
      const inRange =
        start < end ? hhmm >= start && hhmm <= end : hhmm >= start || hhmm <= end; // handles overnight windows
      if (inRange) continue;
    }

    const channelsRow = channelsByUser.get(rule.user_id);
    const channels: string[] = Array.isArray(rule.channels) ? rule.channels : ["telegram"];

    for (const channel of channels) {
      attempted += 1;
      let status: "queued" | "delivered" | "failed" = "queued";

      try {
        if (channel === "telegram") {
          if (!channelsRow?.telegram_chat_id) {
            status = "queued";
          } else {
            const result = await telegram.sendMessage(
              channelsRow.telegram_chat_id,
              `${messagePrefix} — ${signal.title}\n\n${signal.summary}`,
            );
            status = result.ok ? "delivered" : "failed";
          }
        } else if (channel === "slack") {
          if (!channelsRow?.slack_webhook_url) {
            status = "queued";
          } else {
            await axios.post(
              channelsRow.slack_webhook_url,
              { text: `${slackMessagePrefix} — ${signal.title}\n${signal.summary}` },
              { timeout: 10_000 },
            );
            status = "delivered";
          }
        } else if (channel === "webhook") {
          const hooks = webhooksByUser.get(rule.user_id) ?? [];
          for (const hook of hooks) {
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
            }
          }
        }

        if (status === "delivered") delivered += 1;
      } catch {
        status = "failed";
      }

      alertsSentRows.push({
        user_id: rule.user_id,
        rule_id: rule.id,
        signal_id: signalId,
        channel,
        status,
        delivered_at: status === "delivered" ? new Date().toISOString() : null,
      });
    }

    // Push notifications for any user with tokens (best-effort) — once per matched
    // rule, not once per channel (channel-sending logic above is otherwise untouched).
    const tokens = pushTokensByUser.get(rule.user_id) ?? [];
    const pushTitle = escalation
      ? `UPDATED (${escalation.oldSeverity} → ${escalation.newSeverity}/10): ${signal.title}`
      : signal.title;
    for (const t of tokens) {
      try {
        await expoPush.send(t, pushTitle, signal.summary, { signalId });
      } catch {
        // ignore
      }
    }

    triggeredRuleIds.push(rule.id);
  }

  if (alertsSentRows.length) {
    await supabase.from("alerts_sent").insert(alertsSentRows);
  }
  if (triggeredRuleIds.length) {
    await supabase.from("alert_rules").update({ last_triggered_at: new Date().toISOString() }).in("id", triggeredRuleIds);
  }

  return { attempted, delivered };
}

// ── Dormant BullMQ path ──────────────────────────────────────────────────────
// Nothing currently enqueues jobs onto this queue in the live path (the real
// collectors call dispatchAlertsForSignal() above directly). This worker + queue are
// kept in place, not deleted, as a reserved option for a future move back to a queued
// dispatch model. Do not treat this as the active mechanism, and do not wire a second
// caller onto the `alertDispatcher` queue without removing this comment.
export function startAlertDispatcherWorker() {
  const connection = getRedis();
  if (!connection) {
    console.warn("⚠️ [Alert Dispatcher] Redis connection missing. Worker not started.");
    return null;
  }

  const worker = new Worker(
    QUEUE_NAMES.alertDispatcher,
    async (job) => {
      const signalId = job.data?.signalId as string | undefined;
      if (!signalId) throw new Error("Missing signalId");
      return dispatchAlertsForSignal(signalId);
    },
    { connection, concurrency: 10 },
  );

  return worker;
}
