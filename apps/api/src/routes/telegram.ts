import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";

import { getRedis } from "../clients/redis";
import { getSupabaseAdmin } from "../clients/supabase";
import { requireUser } from "../middleware/auth.middleware";

function randomCode() {
  return crypto.randomBytes(6).toString("hex"); // 12 chars
}

export async function telegramRoutes(app: FastifyInstance) {
  // Authenticated endpoint: generate a connect code for this user
  app.post("/connect-code", async (req, reply) => {
    const user = requireUser(req, reply);
    const redis = getRedis();
    if (!redis) return reply.status(503).send({ error: "Redis not available" });
    const code = randomCode();
    await redis.set(`tg_connect:${code}`, user.id, "EX", 600); // 10 min TTL
    return reply.send({ code });
  });

  // Telegram webhook (no auth): handles /start and /connect <code>
  app.post("/webhook", async (req, reply) => {
    const update = req.body as any;
    const msg = update?.message;
    const text: string = msg?.text ?? "";
    const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
    if (!chatId) return reply.send({ ok: true });

    const redis = getRedis();
    const supabase = getSupabaseAdmin();

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

