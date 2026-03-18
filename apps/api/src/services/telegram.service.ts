import axios from "axios";

import { getEnv } from "../env";

export class TelegramService {
  async sendMessage(chatId: string, text: string) {
    const env = getEnv();
    if (!env.TELEGRAM_BOT_TOKEN) return { ok: false as const, reason: "Missing TELEGRAM_BOT_TOKEN" as const };

    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await axios.post(
      url,
      { chat_id: chatId, text, disable_web_page_preview: true },
      { timeout: 15_000 },
    );
    return { ok: true as const, result: res.data };
  }
}

