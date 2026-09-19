import { createHash } from "node:crypto";

/**
 * Embedding research (2026-09-19, current published prices):
 * - Anthropic has no embeddings API. Docs recommend Voyage AI as the partner.
 * - Cheapest Voyage model: `voyage-4-lite` at $0.02 / million tokens, first
 *   200M tokens free, 256–2048 dims. OpenAI text-embedding-3-small is the same
 *   $0.02/M but is a second vendor outside BBR's Anthropic stack.
 * - This catalog is ~10 short pages, so even Voyage is nearly free; the
 *   operational cost is a new `VOYAGE_API_KEY`. When that key is unset we use
 *   a local hashing-trick embedder (`local-hash-v1`, same 256-d unit vectors)
 *   so pgvector still works without a new paid vendor and without spending
 *   Anthropic budget. Rows store `embedding_model`; query must match.
 */

export const EMBEDDING_DIM = 256;
export const VOYAGE_MODEL = "voyage-4-lite";
export const LOCAL_HASH_MODEL = "local-hash-v1";

export const SIMILARITY_THRESHOLD: Record<string, number> = {
  [VOYAGE_MODEL]: 0.35,
  [LOCAL_HASH_MODEL]: 0.22,
};

export function similarityThresholdFor(model: string): number {
  return SIMILARITY_THRESHOLD[model] ?? 0.35;
}

export function activeEmbeddingModel(): string {
  if (process.env.NODE_ENV === "test") return LOCAL_HASH_MODEL;
  const key = process.env.VOYAGE_API_KEY?.trim();
  return key ? VOYAGE_MODEL : LOCAL_HASH_MODEL;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2);
}

function bucket(token: string, dim: number): { index: number; sign: number } {
  const digest = createHash("sha256").update(token).digest();
  const index = digest.readUInt16BE(0) % dim;
  const sign = digest[2]! & 1 ? 1 : -1;
  return { index, sign };
}

/** Deterministic 256-d hashing-trick embedding. L2-normalized. */
export function localHashEmbedding(text: string, dim = EMBEDDING_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = tokenize(text);
  const grams = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    grams.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  for (const g of grams) {
    const { index, sign } = bucket(g, dim);
    vec[index]! += sign;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

export function embeddingToLiteral(values: number[]): string {
  return `[${values.map((v) => Number(v).toFixed(8)).join(",")}]`;
}

type VoyageResponse = {
  data?: Array<{ embedding?: number[] }>;
};

async function voyageEmbed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) throw new Error("VOYAGE_API_KEY missing");

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: inputType,
      output_dimension: EMBEDDING_DIM,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`voyage_embed_failed:${res.status}:${body.slice(0, 180)}`);
  }
  const json = (await res.json()) as VoyageResponse;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    const embedding = json.data?.[i]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
      throw new Error("voyage_embed_bad_dim");
    }
    out.push(embedding);
  }
  return out;
}

export async function embedTexts(
  texts: string[],
  kind: "document" | "query",
  model = activeEmbeddingModel(),
): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (model === VOYAGE_MODEL) {
    return voyageEmbed(texts, kind);
  }
  return texts.map((t) => localHashEmbedding(t));
}

export async function embedQuery(query: string, model = activeEmbeddingModel()): Promise<number[]> {
  const [vec] = await embedTexts([query], "query", model);
  if (!vec) throw new Error("embed_query_empty");
  return vec;
}
