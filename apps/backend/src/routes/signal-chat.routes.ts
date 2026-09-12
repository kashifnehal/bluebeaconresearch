import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getSupabaseAdmin } from "../clients/supabase.js";
import {
  AnthropicBudgetExceededError,
  CHAT_BUDGET_EXCEEDED_MESSAGE,
  isAnthropicBudgetAvailable,
} from "../lib/anthropic-budget.js";
import { isChatAllowedEmail } from "../lib/chat-allowlist.js";
import {
  type ChatRelevanceCategory,
  fixedReplyForCategory,
  heuristicChatRelevance,
} from "../lib/chat-relevance.js";
import { recordServiceHealth } from "../lib/service-health.js";
import { sourceUrlsForSignal } from "../lib/signal-source-urls.js";
import { requireUser } from "../middleware/auth.middleware.js";
import { ClaudeService } from "../services/claude.service.js";

// #111 (backend half) — per-signal AI chat, grounded only in that signal's own data.
// Follows the same Fastify-plugin pattern as price-history.ts: an exported async
// function taking `app`, registered in app.ts with `app.register(..., { prefix })`.

const claudeService = new ClaudeService();

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

const DAILY_MESSAGE_LIMIT = 30;
const BURST_MESSAGE_LIMIT = 5;
const BURST_WINDOW_MS = 5 * 60 * 1000;

type ChatLimitReason = "rate_limited" | "rate_limited_burst" | "count_failed";

async function chatLimitReason(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<ChatLimitReason | null> {
  const dailySince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const burstSince = new Date(Date.now() - BURST_WINDOW_MS).toISOString();

  const daily = await supabase
    .from("signal_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", dailySince);

  if (daily.error) {
    // Cost guardrail — fail closed. A false block is cheaper than an unmetered bypass.
    console.warn(`⚠️ [signal-chat] daily count query failed: ${daily.error.message}`);
    return "count_failed";
  }
  if ((daily.count ?? 0) >= DAILY_MESSAGE_LIMIT) return "rate_limited";

  const burst = await supabase
    .from("signal_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", burstSince);

  if (burst.error) {
    console.warn(`⚠️ [signal-chat] burst count query failed: ${burst.error.message}`);
    return "count_failed";
  }
  if ((burst.count ?? 0) >= BURST_MESSAGE_LIMIT) return "rate_limited_burst";
  return null;
}

function denyEarlyAccess(reply: { status: (code: number) => { send: (body: unknown) => unknown } }) {
  return reply.status(403).send({ error: "chat_early_access_only" });
}

export async function signalChatRoutes(app: FastifyInstance) {
  app.get("/:id/chat", async (req, reply) => {
    const user = requireUser(req, reply);
    const signalId = String((req.params as { id?: string })?.id ?? "");
    if (!signalId) return reply.status(400).send({ error: "missing_signal_id" });

    // Manual early-access gate (CHAT_ALLOWED_EMAILS). Not billing — replace once #84 exists.
    // Fail closed when the list is unset/empty. Distinct from premium_required.
    if (!isChatAllowedEmail(user.email)) {
      return denyEarlyAccess(reply);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("signal_chat_messages")
      .select("id,role,content,created_at")
      .eq("signal_id", signalId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) return reply.status(500).send({ error: "Query failed" });
    return reply.send({ data: data ?? [] });
  });

  app.post("/:id/chat", async (req, reply) => {
    const user = requireUser(req, reply);
    const signalId = String((req.params as { id?: string })?.id ?? "");
    if (!signalId) return reply.status(400).send({ error: "missing_signal_id" });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", issues: parsed.error.issues });
    }
    const { message } = parsed.data;

    // Manual early-access gate (CHAT_ALLOWED_EMAILS). Not billing — replace once #84 exists.
    // Fail closed when the list is unset/empty. Distinct from premium_required.
    if (!isChatAllowedEmail(user.email)) {
      return denyEarlyAccess(reply);
    }

    // Plan-tier gate. Today every user defaults to 'pro' (no real billing tiers
    // yet), so this passes for everyone in practice — it's here so it's already
    // correct once free-tier accounts exist. Not planGuard() middleware: that
    // helper returns a different error body ({ error: "Plan upgrade required" });
    // this endpoint's spec requires { error: "premium_required" } exactly.
    if (user.planTier === "free") {
      return reply.status(403).send({ error: "premium_required" });
    }

    const supabase = getSupabaseAdmin();

    const limit = await chatLimitReason(supabase, user.id);
    if (limit === "count_failed") {
      return reply.status(429).send({ error: "rate_limited" });
    }
    if (limit) {
      return reply.status(429).send({ error: limit });
    }

    if (!(await isAnthropicBudgetAvailable("chat"))) {
      return reply.status(503).send({
        error: "ai_temporarily_unavailable",
        message: CHAT_BUDGET_EXCEEDED_MESSAGE,
      });
    }

    const { data: signal, error: signalError } = await supabase
      .from("signals")
      .select("*")
      .eq("id", signalId)
      .maybeSingle();

    if (signalError) return reply.status(500).send({ error: "Query failed" });
    if (!signal) return reply.status(404).send({ error: "Not found" });

    const { data: priorRows, error: priorError } = await supabase
      .from("signal_chat_messages")
      .select("role,content,created_at")
      .eq("signal_id", signalId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (priorError) return reply.status(500).send({ error: "Query failed" });
    const priorMessages = (priorRows ?? [])
      .slice()
      .reverse()
      .map((r) => ({ role: r.role as string, content: r.content as string }));
    const lastUserMessage = [...priorMessages].reverse().find((m) => m.role === "user")?.content;

    const heuristicCategory = heuristicChatRelevance(message, lastUserMessage);
    let category: ChatRelevanceCategory = heuristicCategory ?? "relevant";
    if (heuristicCategory == null) {
      try {
        category = await claudeService.classifyChatRelevance(
          message,
          String(signal.title ?? ""),
        );
      } catch (err) {
        if (err instanceof AnthropicBudgetExceededError) {
          return reply.status(503).send({
            error: "ai_temporarily_unavailable",
            message: CHAT_BUDGET_EXCEEDED_MESSAGE,
          });
        }
        req.log?.warn?.({ err }, "[signal-chat] relevance Haiku failed — treating as relevant");
        category = "relevant";
      }
    }

    await recordServiceHealth("anthropic", "ok", `chatRelevanceDecision:${category}`);

    if (category !== "relevant") {
      const reply_text = fixedReplyForCategory(category, message);
      const { error: insertUserError } = await supabase.from("signal_chat_messages").insert({
        signal_id: signalId,
        user_id: user.id,
        role: "user",
        content: message,
      });
      if (insertUserError) return reply.status(500).send({ error: "Query failed" });
      const { error: insertAssistantError } = await supabase.from("signal_chat_messages").insert({
        signal_id: signalId,
        user_id: user.id,
        role: "assistant",
        content: reply_text,
      });
      if (insertAssistantError) return reply.status(500).send({ error: "Query failed" });
      return reply.send({ reply: reply_text });
    }

    const { error: insertUserError } = await supabase.from("signal_chat_messages").insert({
      signal_id: signalId,
      user_id: user.id,
      role: "user",
      content: message,
    });
    if (insertUserError) return reply.status(500).send({ error: "Query failed" });

    const sourceUrls = await sourceUrlsForSignal(signal);

    let reply_text: string;
    try {
      reply_text = await claudeService.chatAboutSignal(
        signal,
        priorMessages,
        message,
        sourceUrls,
      );
    } catch (err) {
      if (err instanceof AnthropicBudgetExceededError) {
        return reply.status(503).send({
          error: "ai_temporarily_unavailable",
          message: CHAT_BUDGET_EXCEEDED_MESSAGE,
        });
      }
      req.log?.error?.({ err }, "[signal-chat] chatAboutSignal threw unexpectedly");
      return reply.status(503).send({ error: "ai_temporarily_unavailable" });
    }

    const { error: insertAssistantError } = await supabase.from("signal_chat_messages").insert({
      signal_id: signalId,
      user_id: user.id,
      role: "assistant",
      content: reply_text,
    });
    if (insertAssistantError) return reply.status(500).send({ error: "Query failed" });

    return reply.send({ reply: reply_text });
  });
}
