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

// One-line trust/differentiation statement carried on every delivery, shortened for a
// chat message. Approved framing: docs/claude_project/00_PROJECT.md §7, 20_RISKS.md
// ("Disclaimer on every signal card, every email, every alert delivery").
const TRUST_LINE =
  "Blue Beacon surfaces signals for your own analysis — informational only, not financial advice or a buy/sell call.";

const DIRECTION_ARROW: Record<string, string> = { up: "↑", down: "↓", volatile: "↕", neutral: "→" };

/**
 * Lead prose of the analyst briefing, stripped of markdown, capped for a chat message.
 * Skips leading heading lines (all-caps banners, "#" headers, short label lines) so the
 * "why it matters" section opens on an actual sentence, not "INTELLIGENCE BRIEFING —".
 */
function firstParagraph(text: string, cap = 420): string {
  const plain = text.replace(/[*_`>]/g, "").replace(/\r/g, "").trim();
  const paras = plain
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/gm, "").replace(/\n/g, " ").trim())
    .filter(Boolean);
  const isHeading = (p: string) =>
    p.length < 60 || (p === p.toUpperCase() && /[A-Z]/.test(p)) || !/[.!?]/.test(p);
  const lead = paras.find((p) => !isHeading(p)) ?? paras[0] ?? plain;
  return lead.length > cap ? `${lead.slice(0, cap - 1).trimEnd()}…` : lead;
}

/**
 * Structured alert body shared by the in-app Alerts card (#82) and every chat channel:
 * Event → Why it matters → Which instruments → Alert threshold, then the source link(s)
 * and the trust line. Same information, same order as the web card — only the formatting
 * differs for the medium.
 */
export function buildAlertBody(
  signal: any,
  rule: { name?: string | null; min_severity?: number | null },
  sourceUrls: string[],
): string {
  const impacts = Array.isArray(signal.commodity_impacts) ? signal.commodity_impacts : [];
  const instruments = impacts.length
    ? impacts
        .map((c: any) => `${c.asset} ${DIRECTION_ARROW[c.direction as string] ?? "→"}`)
        .join("  ·  ")
    : "No specific instruments were flagged for this event.";

  const why = signal.ai_analysis
    ? firstParagraph(String(signal.ai_analysis))
    : `${signal.summary ?? "No summary available."}\n(Deeper analyst commentary wasn't available for this signal.)`;

  const threshold =
    `Sent because it cleared "${rule.name ?? "your alert rule"}" — severity ${rule.min_severity ?? "?"}+.`;

  const lines = [
    `EVENT`,
    signal.title,
    ``,
    `WHY IT MATTERS`,
    why,
    ``,
    `WHICH INSTRUMENTS`,
    instruments,
    ``,
    `ALERT THRESHOLD`,
    threshold,
  ];

  if (sourceUrls.length) {
    lines.push(``, `SOURCE${sourceUrls.length > 1 ? "S" : ""}`, ...sourceUrls);
  }

  lines.push(``, TRUST_LINE);
  return lines.join("\n");
}

/**
 * Matches a freshly-inserted (or escalated) signal against active alert_rules and
 * dispatches to each matched rule's configured channels. Called directly (inline, no
 * queue) from each collector right after it inserts a signal — the same "bypass
 * BullMQ" pattern already used for classification, since nothing currently feeds the
 * dormant `alertDispatcher` queue (see startAlertDispatcherWorker below). Batches
 * per-rule lookups (prefs, channels, push tokens, webhook endpoints) instead of
 * querying once per rule/channel.
 *
 * `escalation`, when passed, changes the outgoing Telegram/Slack prefix and push title
 * to a distinct "UPDATED: severity X -> Y" framing instead of the default new-signal
 * wording, so a re-alert is never confusable with a first-time alert. Every other part
 * of this function (rule matching, batching, alerts_sent/webhook_deliveries writes,
 * channel iteration) is untouched and shared — this is the same send path, not a
 * parallel one.
 *
 * #82: the Telegram/Slack body is now the same four-section structure as the in-app
 * Alerts card — Event → Why it matters → Which instruments → Alert threshold — plus the
 * source link(s) and a one-line trust/differentiation statement. See buildAlertBody().
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

  // Source article(s) the signal was built from — already linked through the pipeline
  // via signals.raw_event_ids → raw_events.raw_data.url. Surfaced in every delivery.
  const rawEventIds: string[] = Array.isArray(signal.raw_event_ids) ? signal.raw_event_ids : [];
  const { data: rawEventRows } = rawEventIds.length
    ? await supabase.from("raw_events").select("raw_data").in("id", rawEventIds)
    : { data: [] as Array<{ raw_data?: { url?: string } }> };
  const sourceUrls = (rawEventRows ?? [])
    .map((r) => r?.raw_data?.url)
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .slice(0, 3);

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

    // Four-section body — identical structure/order to the in-app Alerts card (#82).
    const alertBody = buildAlertBody(signal, rule, sourceUrls);
    const telegramText = `${messagePrefix}\n\n${alertBody}`;
    const slackText = `${slackMessagePrefix}\n\n${alertBody}`;

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
              telegramText,
            );
            status = result.ok ? "delivered" : "failed";
          }
        } else if (channel === "slack") {
          if (!channelsRow?.slack_webhook_url) {
            status = "queued";
          } else {
            await axios.post(
              channelsRow.slack_webhook_url,
              { text: slackText },
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
