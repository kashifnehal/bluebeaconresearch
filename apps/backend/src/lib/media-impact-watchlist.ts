import { getSupabaseAdmin } from "../clients/supabase.js";

// #142 — live replacement for #141's hardcoded MATERIALITY_WATCHLIST.
// classifyEvent() embeds this in the prompt; heuristicClassify() matches
// entity_name + aliases. Cache shape matches the in-memory TTL map in
// routes/price-history.ts (process-local, short TTL, stale-on-error).

export const MEDIA_IMPACT_WATCHLIST_CACHE_TTL_MS = 10 * 60 * 1000;

export type MediaImpactTier =
  | "institutional_official"
  | "political_geopolitical"
  | "individual_social_media";

export type MediaImpactWatchlistEntry = {
  entityName: string;
  entityAliases: string[];
  tier: MediaImpactTier;
  markets: string[];
  statementType: string;
  evidenceSummary: string;
  evidenceSources: string[];
  caveat: string;
};

type CacheEntry = {
  expiresAt: number;
  entries: MediaImpactWatchlistEntry[];
};

let cache: CacheEntry | null = null;

export function setWatchlistCacheForTests(
  entries: MediaImpactWatchlistEntry[] | null,
): void {
  cache = entries
    ? { expiresAt: Date.now() + MEDIA_IMPACT_WATCHLIST_CACHE_TTL_MS, entries }
    : null;
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termToPattern(term: string): string {
  const trimmed = term.trim();
  if (!trimmed) return "";
  const escaped = escapeRegex(trimmed).replace(/\s+/g, "\\s+");
  const startsWord = /^\w/.test(trimmed);
  const endsWord = /\w$/.test(trimmed);
  return `${startsWord ? "\\b" : ""}${escaped}${endsWord ? "\\b" : ""}`;
}

function normalizeEntry(row: {
  entity_name?: string;
  entity_aliases?: string[] | null;
  tier?: string;
  markets?: string[] | null;
  statement_type?: string;
  evidence_summary?: string;
  evidence_sources?: string[] | null;
  caveat?: string;
}): MediaImpactWatchlistEntry | null {
  const entityName = String(row.entity_name ?? "").trim();
  if (!entityName) return null;
  return {
    entityName,
    entityAliases: Array.isArray(row.entity_aliases)
      ? row.entity_aliases.map((a) => String(a).trim()).filter(Boolean)
      : [],
    tier: (row.tier ?? "institutional_official") as MediaImpactTier,
    markets: Array.isArray(row.markets) ? row.markets.map(String) : [],
    statementType: String(row.statement_type ?? ""),
    evidenceSummary: String(row.evidence_summary ?? ""),
    evidenceSources: Array.isArray(row.evidence_sources)
      ? row.evidence_sources.map(String)
      : [],
    caveat: String(row.caveat ?? "").trim(),
  };
}

export async function getActiveWatchlist(): Promise<MediaImpactWatchlistEntry[]> {
  if (cache && Date.now() < cache.expiresAt) return cache.entries;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("media_impact_watchlist")
      .select(
        "entity_name, entity_aliases, tier, markets, statement_type, evidence_summary, evidence_sources, caveat",
      )
      .eq("active", true);
    if (error) throw error;
    const entries = (data ?? [])
      .map((row) => normalizeEntry(row))
      .filter((row): row is MediaImpactWatchlistEntry => row !== null);
    cache = {
      expiresAt: Date.now() + MEDIA_IMPACT_WATCHLIST_CACHE_TTL_MS,
      entries,
    };
    return entries;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (cache) {
      console.warn(
        `[media-impact-watchlist] fetch failed (${reason}); serving stale cache`,
      );
      return cache.entries;
    }
    console.warn(
      `[media-impact-watchlist] fetch failed (${reason}); empty watchlist`,
    );
    return [];
  }
}

/** Same `- name — caveat.` block #141 inlined in classifyEvent()'s prompt. */
export function formatWatchlistPromptBlock(
  entries: MediaImpactWatchlistEntry[],
): string {
  if (entries.length === 0) {
    return "- (watchlist unavailable this cycle)";
  }
  return entries
    .map((e) => {
      const caveat = e.caveat.replace(/\s+/g, " ").trim();
      return `- ${e.entityName} — ${caveat}`;
    })
    .join("\n");
}

/** First matching entity_name, or null. Used by heuristicClassify(). */
export function matchWatchlistEntity(
  text: string,
  entries: MediaImpactWatchlistEntry[],
): string | null {
  const haystack = String(text ?? "");
  if (!haystack.trim()) return null;
  for (const entry of entries) {
    const terms = [entry.entityName, ...entry.entityAliases]
      .map(termToPattern)
      .filter(Boolean);
    if (terms.length === 0) continue;
    const matcher = new RegExp(terms.join("|"), "i");
    if (matcher.test(haystack)) return entry.entityName;
  }
  return null;
}

/**
 * Claude must return an exact entity_name (or a known alias). Anything else
 * — including unsourced names — becomes null and never reaches the DB.
 */
export function sanitizeMediaImpactEntity(
  raw: unknown,
  entries: MediaImpactWatchlistEntry[],
): string | null {
  if (typeof raw !== "string") return null;
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  for (const entry of entries) {
    if (entry.entityName.toLowerCase() === needle) return entry.entityName;
    if (entry.entityAliases.some((alias) => alias.toLowerCase() === needle)) {
      return entry.entityName;
    }
  }
  return null;
}

/** First sentence, capped — the hover/detail line, not the full research note. */
export function shortMediaImpactCaveat(caveat: string): string {
  const trimmed = String(caveat ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const sentenceEnd = trimmed.search(/(?<=[.!?])\s+/);
  const first = sentenceEnd === -1 ? trimmed : trimmed.slice(0, sentenceEnd + 1);
  if (first.length <= 180) return first.trim();
  return `${first.slice(0, 177).trimEnd()}…`;
}
