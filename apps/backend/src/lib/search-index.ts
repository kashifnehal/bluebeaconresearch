import { createHash } from "node:crypto";

import { getSupabaseAdmin } from "../clients/supabase.js";
import { catalogContentHash, getSearchCatalog } from "./search-catalog.js";
import {
  activeEmbeddingModel,
  embedTexts,
  embeddingToLiteral,
} from "./search-embeddings.js";

let inFlight: Promise<void> | null = null;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function ensureSearchContentIndex(): Promise<void> {
  if (inFlight) {
    await inFlight;
    return;
  }
  inFlight = (async () => {
    const catalog = getSearchCatalog();
    const model = activeEmbeddingModel();
    const hash = sha256(catalogContentHash(catalog) + "\n" + model);
    const supabase = getSupabaseAdmin();

    const { data: existing, error: readError } = await supabase
      .from("search_content_embeddings")
      .select("content_key, content_hash, embedding_model");
    if (readError) throw readError;

    const rows = existing ?? [];
    const upToDate =
      rows.length === catalog.length &&
      rows.every((r) => r.content_hash === hash && r.embedding_model === model) &&
      catalog.every((e) => rows.some((r) => r.content_key === e.contentKey));
    if (upToDate) return;

    const vectors = await embedTexts(
      catalog.map((e) => `${e.title}. ${e.content}`),
      "document",
      model,
    );
    const now = new Date().toISOString();
    const payload = catalog.map((e, i) => ({
      content_key: e.contentKey,
      title: e.title,
      url: e.url,
      content: e.content,
      embedding: embeddingToLiteral(vectors[i]!),
      embedding_model: model,
      source_kind: e.sourceKind,
      content_hash: hash,
      updated_at: now,
    }));

    const { error: upsertError } = await supabase
      .from("search_content_embeddings")
      .upsert(payload, { onConflict: "content_key" });
    if (upsertError) throw upsertError;

    const keep = catalog.map((e) => e.contentKey);
    const stale = rows.map((r) => r.content_key).filter((k) => !keep.includes(k));
    if (stale.length > 0) {
      await supabase.from("search_content_embeddings").delete().in("content_key", stale);
    }
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}
