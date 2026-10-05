import axios from "axios";

import { getEnv } from "../env.js";

export type TelegramInlineButton = { text: string; callback_data: string };

// alert_feedback callback_data shape: "fb:<value>:<alerts_sent_id>" — Telegram caps
// callback_data at 64 bytes (see telegram.service.test.ts), well clear of a uuid payload.
const FEEDBACK_BUTTONS: Array<{ label: string; value: "useful" | "not_useful" | "mute_topic" }> = [
  { label: "👍 Useful", value: "useful" },
  { label: "👎 Not useful", value: "not_useful" },
  { label: "🔇 Mute topic", value: "mute_topic" },
];

export class TelegramService {
  async sendMessage(
    chatId: string,
    text: string,
    options?: { inlineKeyboard?: TelegramInlineButton[][] },
  ) {
    const env = getEnv();
    if (!env.TELEGRAM_BOT_TOKEN) return { ok: false as const, reason: "Missing TELEGRAM_BOT_TOKEN" as const };

    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await axios.post(
      url,
      {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(options?.inlineKeyboard ? { reply_markup: { inline_keyboard: options.inlineKeyboard } } : {}),
      },
      { timeout: 15_000 },
    );
    return { ok: true as const, result: res.data };
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    const env = getEnv();
    if (!env.TELEGRAM_BOT_TOKEN) return { ok: false as const, reason: "Missing TELEGRAM_BOT_TOKEN" as const };

    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    const res = await axios.post(
      url,
      { callback_query_id: callbackQueryId, ...(text ? { text } : {}) },
      { timeout: 15_000 },
    );
    return { ok: true as const, result: res.data };
  }

  buildFeedbackKeyboard(alertsSentId: string): TelegramInlineButton[][] {
    return [
      FEEDBACK_BUTTONS.map((b) => ({ text: b.label, callback_data: `fb:${b.value}:${alertsSentId}` })),
    ];
  }
}
