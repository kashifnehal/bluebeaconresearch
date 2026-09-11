import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getSupabaseAdmin } from "../clients/supabase.js";
import { requireUser } from "../middleware/auth.middleware.js";
import { ClaudeService } from "../services/claude.service.js";

// #111 (backend half) — per-signal AI chat, grounded only in that signal's own data.
// Follows the same Fastify-plugin pattern as price-history.ts: an exported async
// function taking `app`, registered in app.ts with `app.register(..., { prefix })`.

const claudeService = new ClaudeService();

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

// Simple per-user daily counter (Step 0: no existing per-user rate-limit pattern
// in this app — @fastify/rate-limit in app.ts is a flat, per-instance, per-minute
// limiter, not per-user/daily). Counting rows in signal_chat_messages avoids a new
// dependency or in-memory store, at the cost of one extra query per POST.
const DAILY_MESSAGE_LIMIT = 30;

async function isRateLimited(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("signal_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "user")
    .gte("created_at", since);

  if (error) {
    // Fail open on a counting error rather than blocking chat entirely — same
    // "degrade, don't 500" posture as the rest of this app's Claude/Redis paths.
    console.warn(`⚠️ [signal-chat] rate-limit count query failed: ${error.message}`);
    return false;
  }
  return (count ?? 0) >= DAILY_MESSAGE_LIMIT;
}

export async function signalChatRoutes(app: FastifyInstance) {
  app.get("/:id/chat", async (req, reply) => {
    const user = requireUser(req, reply);
    const signalId = String((req.params as { id?: string })?.id ?? "");
    if (!signalId) return reply.status(400).send({ error: "missing_signal_id" });

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

    // Plan-tier gate. Today every user defaults to 'pro' (no real billing tiers
    // yet), so this passes for everyone in practice — it's here so it's already
    // correct once free-tier accounts exist. Not planGuard() middleware: that
    // helper returns a different error body ({ error: "Plan upgrade required" });
    // this endpoint's spec requires { error: "premium_required" } exactly.
    if (user.planTier === "free") {
      return reply.status(403).send({ error: "premium_required" });
    }

    const supabase = getSupabaseAdmin();

    if (await isRateLimited(supabase, user.id)) {
      return reply.status(429).send({ error: "rate_limited" });
    }

    // Reuse the same signal lookup as events.ts's GET /v1/events/:id.
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

    const { error: insertUserError } = await supabase.from("signal_chat_messages").insert({
      signal_id: signalId,
      user_id: user.id,
      role: "user",
      content: message,
    });
    if (insertUserError) return reply.status(500).send({ error: "Query failed" });

    let reply_text: string;
    try {
      reply_text = await claudeService.chatAboutSignal(signal, priorMessages, message);
    } catch (err) {
      // chatAboutSignal() itself already catches and degrades on known Anthropic API
      // errors (returns a fallback string) — this catch is the backstop for anything
      // that still throws (e.g. an unexpected SDK exception), so the route never 500s
      // with a generic message here. 503, not 500: this is a dependency being
      // unavailable, not a bug in this request, and the frontend can show a specific,
      // honest "AI is temporarily unavailable" message instead of a vague "try again."
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
