import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getSupabaseAdmin } from "../clients/supabase.js";
import {
  AnthropicBudgetExceededError,
  CHAT_BUDGET_EXCEEDED_MESSAGE,
  isAnthropicBudgetAvailable,
} from "../lib/anthropic-budget.js";
import { parseSearchAssistAnswer, pickConfidentMatch } from "../lib/search-assist.js";
import {
  activeEmbeddingModel,
  embedQuery,
  embeddingToLiteral,
  similarityThresholdFor,
} from "../lib/search-embeddings.js";
import { ensureSearchContentIndex } from "../lib/search-index.js";
import { recordServiceHealth } from "../lib/service-health.js";
import { requireUser } from "../middleware/auth.middleware.js";
import { ClaudeService } from "../services/claude.service.js";

const claudeService = new ClaudeService();

const bodySchema = z.object({
  query: z.string().trim().min(2).max(200),
});

type MatchRow = {
  content_key: string;
  title: string;
  url: string;
  content: string;
  source_kind: string;
  similarity: number;
};

function noConfidentAnswer(reply: { send: (body: unknown) => unknown }) {
  return reply.send({ status: "no_confident_answer" });
}

export async function searchRoutes(app: FastifyInstance) {
  app.post("/assist", async (req, reply) => {
    requireUser(req, reply);

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid body", issues: parsed.error.issues });
    }
    const { query } = parsed.data;

    if (!(await isAnthropicBudgetAvailable("chat"))) {
      return reply.status(503).send({
        error: "ai_temporarily_unavailable",
        message: CHAT_BUDGET_EXCEEDED_MESSAGE,
      });
    }

    try {
      await ensureSearchContentIndex();
    } catch (err) {
      req.log?.warn?.({ err }, "[search-assist] index ensure failed");
      return noConfidentAnswer(reply);
    }

    const model = activeEmbeddingModel();
    const threshold = similarityThresholdFor(model);

    let queryEmbedding: number[];
    try {
      queryEmbedding = await embedQuery(query, model);
    } catch (err) {
      req.log?.warn?.({ err }, "[search-assist] query embed failed");
      return noConfidentAnswer(reply);
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("match_search_content", {
      query_embedding: embeddingToLiteral(queryEmbedding),
      match_threshold: threshold,
      match_count: 1,
      filter_model: model,
    });
    if (error) {
      req.log?.warn?.({ err: error }, "[search-assist] match rpc failed");
      return noConfidentAnswer(reply);
    }

    const match = pickConfidentMatch(
      ((data ?? []) as MatchRow[]).map((row) => ({
        contentKey: row.content_key,
        title: row.title,
        url: row.url,
        content: row.content,
        sourceKind: row.source_kind,
        similarity: Number(row.similarity),
      })),
      threshold,
    );
    if (!match) return noConfidentAnswer(reply);

    let raw: string;
    try {
      raw = await claudeService.answerSearchAssist(query, {
        title: match.title,
        url: match.url,
        content: match.content,
      });
    } catch (err) {
      if (err instanceof AnthropicBudgetExceededError) {
        return reply.status(503).send({
          error: "ai_temporarily_unavailable",
          message: CHAT_BUDGET_EXCEEDED_MESSAGE,
        });
      }
      req.log?.warn?.({ err }, "[search-assist] Haiku failed");
      await recordServiceHealth(
        "anthropic",
        "error",
        `searchAssist: ${err instanceof Error ? err.message : "unknown"}`,
      );
      return reply.status(503).send({ error: "ai_temporarily_unavailable" });
    }

    const answer = parseSearchAssistAnswer(raw, match.url);
    if (!answer) return noConfidentAnswer(reply);

    return reply.send({
      status: "ok",
      answer,
      title: match.title,
      url: match.url,
      similarity: match.similarity,
    });
  });
}
