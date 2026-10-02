import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";

import { getRedis } from "../clients/redis.js";
import { getSupabaseAdmin } from "../clients/supabase.js";
import { getEnv } from "../env.js";
import { requireUser } from "../middleware/auth.middleware.js";
import { TelegramService } from "../services/telegram.service.js";

function randomCode() {
  return crypto.randomBytes(6).toString("hex"); // 12 chars
}

const FEEDBACK_VALUES = ["useful", "not_useful", "mute_topic"] as const;
export type FeedbackValue = (typeof FEEDBACK_VALUES)[number];

// callback_data shape sent by TelegramService.buildFeedbackKeyboard(): "fb:<value>:<alerts_sent_id>".
export function parseFeedbackCallback(
  data: string | undefined | null,
): { value: FeedbackValue; alertsSentId: string } | null {
  if (!data) return null;
  const match = /^fb:(useful|not_useful|mute_topic):([0-9a-f-]{36})$/i.exec(data);
  if (!match) return null;
  return { value: match[1] as FeedbackValue, alertsSentId: match[2] };
}

// Ownership check: the Telegram chat answering the callback must be the same chat
// linked (via user_channels.telegram_chat_id) to the user the alerts_sent row belongs
// to. A chat with no link, or a link to a different user, must be ignored.
export function chatOwnsAlert(
  channelUserId: string | null | undefined,
  alertUserId: string | null | undefined,
): boolean {
  return Boolean(channelUserId) && channelUserId === alertUserId;
}

export async function telegramRoutes(app: FastifyInstance) {
  const telegram = new TelegramService();

  // Authenticated endpoint: generate a connect code for this user
  app.post("/connect-code", async (req, reply) => {
    const user = requireUser(req, reply);
    const redis = getRedis();
    if (!redis) return reply.status(503).send({ error: "Redis not available" });
    const code = randomCode();
    await redis.set(`tg_connect:${code}`, user.id, "EX", 600); // 10 min TTL
    return reply.send({ code });
  });

  // Telegram webhook (no auth): handles /start, /connect <code>, and inline-keyboard
  // feedback callback_query updates.
  app.post("/webhook", async (req, reply) => {
    const env = getEnv();
    if (env.TELEGRAM_WEBHOOK_SECRET) {
      const provided = req.headers["x-telegram-bot-api-secret-token"];
      if (provided !== env.TELEGRAM_WEBHOOK_SECRET) {
        return reply.status(401).send({ error: "invalid secret token" });
      }
    }

    const update = req.body as any;
    const supabase = getSupabaseAdmin();

    const callbackQuery = update?.callback_query;
    if (callbackQuery) {
      const callbackQueryId: string | undefined = callbackQuery.id;
      const chatId = callbackQuery?.message?.chat?.id ? String(callbackQuery.message.chat.id) : null;
      const parsed = parseFeedbackCallback(callbackQuery?.data);

      if (!parsed || !chatId) {
        if (callbackQueryId) await telegram.answerCallbackQuery(callbackQueryId);
        return reply.send({ ok: true });
      }

      const { data: channelRow } = await supabase
        .from("user_channels")
        .select("user_id")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      const { data: alertRow } = await supabase
        .from("alerts_sent")
        .select("user_id")
        .eq("id", parsed.alertsSentId)
        .maybeSingle();

      if (!chatOwnsAlert(channelRow?.user_id, alertRow?.user_id)) {
        if (callbackQueryId) await telegram.answerCallbackQuery(callbackQueryId, "Not recognized.");
        return reply.send({ ok: true });
      }

      await supabase.from("alert_feedback").insert({
        user_id: channelRow!.user_id,
        alerts_sent_id: parsed.alertsSentId,
        value: parsed.value,
      });

      // "mute_topic" records feedback only in this version — it does not change
      // alert_rules or thresholds (doc 64).
      const ackText =
        parsed.value === "useful"
          ? "Thanks — noted as useful."
          : parsed.value === "not_useful"
            ? "Thanks — noted as not useful."
            : "Got it — recorded. This doesn't change your alert rules yet.";
      if (callbackQueryId) await telegram.answerCallbackQuery(callbackQueryId, ackText);
      return reply.send({ ok: true });
    }

    const msg = update?.message;
    const text: string = msg?.text ?? "";
    const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
    if (!chatId) return reply.send({ ok: true });

    const redis = getRedis();

    const trimmed = String(text).trim();
    if (trimmed.startsWith("/connect")) {
      const parts = trimmed.split(/\s+/);
      const code = parts[1];
      if (!code) return reply.send({ ok: true });
      if (!redis) return reply.send({ ok: true });
      const userId = await redis.get(`tg_connect:${code}`);
      if (!userId) return reply.send({ ok: true });

      await supabase
        .from("user_channels")
        .upsert(
          {
            user_id: userId,
            telegram_chat_id: chatId,
            telegram_connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (redis) {
        await redis.del(`tg_connect:${code}`);
      }
      return reply.send({ ok: true });
    }

    // /start or anything else: do nothing (code generation happens in-app)
    return reply.send({ ok: true });
  });
}
