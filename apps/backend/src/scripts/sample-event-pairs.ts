/**
 * Read-only sampler for a human-labelled benchmark of candidate signal pairs.
 * Draws four seeded strata of pairs from a fixed one-week window so a person
 * can label each pair "same event" / "update" / "different" / "cannot tell",
 * for later, separate scoring (score-event-pairs.ts) of the live merge rule
 * and the story-threads rule against those labels.
 *
 * Writes only to apps/backend/.tmp/ (git-ignored). Never writes to signals,
 * raw_events, or any other production table, and never changes merge or
 * grouping behavior — this only reads and reports.
 *
 * Usage (from apps/backend):
 *   pnpm sample:pairs             # live run, writes the three output files
 *   pnpm sample:pairs --dry       # preview strata sizes + 3 pairs, no files, no Voyage
 *   pnpm sample:pairs --seed 42   # repeat a specific seeded draw
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { getSupabaseAdmin } from "../clients/supabase.js";
import {
  activeEmbeddingModel,
  cosineSimilarity,
  embedTexts,
  LOCAL_HASH_MODEL,
} from "../lib/search-embeddings.js";
import {
  buildGroups,
  pairBelongsTogether,
  shareASymbol,
  createdWithin24h,
  type ThreadSignal,
} from "../lib/story-threads.js";
import {
  MATCH_WINDOW_HOURS,
  SIMILARITY_THRESHOLD,
  tokenize,
  jaccardSimilarity,
  regionBlocksMerge,
  countriesConflict,
} from "../workers/signal-merge.js";
import { feedLabel, seededShuffle } from "./replay-gate.js";

const WINDOW_START = "2026-11-08T00:00:00Z";
const WINDOW_END = "2026-11-14T19:00:00Z";
export const DEFAULT_SEED = 20261117;
const STRATUM_TARGET = 10;
const PAGE_SIZE = 1000;
const OUT_DIR = fileURLToPath(new URL("../../.tmp/", import.meta.url));
const CSV_PATH = join(OUT_DIR, "pairs-to-label.csv");
const KEY_PATH = join(OUT_DIR, "pairs-key.json");
const INSTRUCTIONS_PATH = join(OUT_DIR, "pairs-instructions.md");

export type Stratum = "S1" | "S2" | "S3" | "S4";

export type PoolSignal = {
  id: string;
  created_at: string;
  event_date: string;
  title: string;
  summary: string | null;
  event_category: string | null;
  country: string | null;
  region: string | null;
  symbols: string[];
  primaryAsset: string | null;
  feed: string;
  url: string | null;
};

export type LabelPair = {
  pairId: string;
  stratum: Stratum;
  a: PoolSignal;
  b: PoolSignal;
  hoursApart: number;
  summaryJaccard: number;
  titleJaccard: number;
  embeddingCosine: number;
  eventCategoryEqual: boolean;
  countryEqual: boolean;
  sharedAsset: boolean;
  liveMergeJoins: boolean;
  storyThreadsJoins: boolean;
};

function symbolsFromImpacts(impacts: unknown): string[] {
  if (!Array.isArray(impacts)) return [];
  const out: string[] = [];
  for (const item of impacts) {
    if (item && typeof item === "object" && typeof (item as { asset?: unknown }).asset === "string") {
      const asset = (item as { asset: string }).asset.trim();
      if (asset) out.push(asset);
    }
  }
  return out;
}

// Mirrors signal-source-urls.ts's urlFromRawData — same "real URL already on
// the raw_events row, never invented" rule, duplicated locally (not exported
// there) per the existing convention in measure-story-threads.ts.
function urlFromRawData(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== "object") return null;
  const url = (rawData as { url?: unknown }).url;
  if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) return url.trim();
  return null;
}

export function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join("|");
}

/** Every unordered pair of signals created within 24h of each other. */
export function candidatePairs(signals: PoolSignal[]): Array<[PoolSignal, PoolSignal]> {
  const out: Array<[PoolSignal, PoolSignal]> = [];
  for (let i = 0; i < signals.length; i++) {
    for (let j = i + 1; j < signals.length; j++) {
      if (createdWithin24h(signals[i]!.created_at, signals[j]!.created_at)) {
        out.push([signals[i]!, signals[j]!]);
      }
    }
  }
  return out;
}

/** Same bilateral check findMergeCandidate() applies, evaluated symmetrically for an offline pair. */
export function liveMergeWouldJoin(a: PoolSignal, b: PoolSignal): boolean {
  const region = (a.region || "").trim();
  if (regionBlocksMerge(region)) return false;
  if ((a.region || "").trim() !== (b.region || "").trim()) return false;
  if (countriesConflict(a.country, b.country)) return false;
  const aTime = Date.parse(a.event_date);
  const bTime = Date.parse(b.event_date);
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return false;
  if (Math.abs(aTime - bTime) > MATCH_WINDOW_HOURS * 3_600_000) return false;
  return jaccardSimilarity(tokenize(a.summary), tokenize(b.summary)) >= SIMILARITY_THRESHOLD;
}

function toThreadSignal(s: PoolSignal): ThreadSignal {
  return { id: s.id, title: s.title, event_category: s.event_category, symbols: s.symbols, created_at: s.created_at };
}

/** signal id -> representative member id of its story-threads.ts connected component. */
export function storyThreadGroupOf(signals: PoolSignal[]): Map<string, string> {
  const groups = buildGroups(signals.map(toThreadSignal), pairBelongsTogether);
  const groupOf = new Map<string, string>();
  for (const group of groups) {
    const rootId = group[0]!.id;
    for (const member of group) groupOf.set(member.id, rootId);
  }
  return groupOf;
}

export function computeDiagnostics(
  a: PoolSignal,
  b: PoolSignal,
  cosine: number,
  groupOf: Map<string, string>,
): Omit<LabelPair, "pairId" | "stratum" | "a" | "b"> {
  const hoursApart = Math.abs(Date.parse(a.created_at) - Date.parse(b.created_at)) / 3_600_000;
  const summaryJaccard = jaccardSimilarity(tokenize(a.summary), tokenize(b.summary));
  const titleJaccard = jaccardSimilarity(tokenize(a.title), tokenize(b.title));
  const eventCategoryEqual = a.event_category !== null && a.event_category === b.event_category;
  const countryEqual = a.country !== null && a.country === b.country;
  const sharedAsset = shareASymbol(a.symbols, b.symbols);
  const liveMergeJoins = liveMergeWouldJoin(a, b);
  const storyThreadsJoins = a.id !== b.id && groupOf.get(a.id) === groupOf.get(b.id);
  return {
    hoursApart,
    summaryJaccard,
    titleJaccard,
    embeddingCosine: cosine,
    eventCategoryEqual,
    countryEqual,
    sharedAsset,
    liveMergeJoins,
    storyThreadsJoins,
  };
}

export type StrataResult = {
  pairs: LabelPair[];
  sizes: Record<Stratum, { pool: number; selected: number }>;
};

/**
 * Pure stratified sampler. `cosineOf` is injected so tests can supply fixed
 * cosine values without calling embedTexts. Order is S1 -> S2 -> S3 -> S4;
 * each later stratum excludes pairs already claimed by an earlier one. S1 is
 * the 10 highest-cosine nearest-neighbor pairs (deterministic, not a random
 * draw). S2/S3/S4 take a seeded random draw of up to 10 from their pool —
 * the task spec only pins S1's "highest" selection and S4's "random"
 * selection explicitly; S2/S3 follow the same seeded-random convention
 * since the task frames the whole draw as "Strata, seeded".
 */
export function buildStrata(
  signals: PoolSignal[],
  cosineOf: (aId: string, bId: string) => number,
  seed: number,
): StrataResult {
  const all = candidatePairs(signals);
  const groupOf = storyThreadGroupOf(signals);
  const used = new Set<string>();
  const pairs: LabelPair[] = [];
  const sizes: Record<Stratum, { pool: number; selected: number }> = {
    S1: { pool: 0, selected: 0 },
    S2: { pool: 0, selected: 0 },
    S3: { pool: 0, selected: 0 },
    S4: { pool: 0, selected: 0 },
  };

  const withDiag = all.map(([a, b]) => {
    const cosine = cosineOf(a.id, b.id);
    return { a, b, key: pairKey(a.id, b.id), diag: computeDiagnostics(a, b, cosine, groupOf) };
  });

  function addSelected(stratum: Stratum, picked: typeof withDiag) {
    for (const row of picked) {
      used.add(row.key);
      pairs.push({ pairId: "", stratum, a: row.a, b: row.b, ...row.diag });
    }
    sizes[stratum].selected = picked.length;
  }

  // S1 — nearest other signal within 24h by cosine, per signal; top 10 distinct pairs.
  const nearestByCosine = new Map<string, { key: string; row: (typeof withDiag)[number] }>();
  for (const row of withDiag) {
    for (const id of [row.a.id, row.b.id]) {
      const current = nearestByCosine.get(id);
      if (!current || row.diag.embeddingCosine > current.row.diag.embeddingCosine) {
        nearestByCosine.set(id, { key: row.key, row });
      }
    }
  }
  const s1Pool = new Map<string, (typeof withDiag)[number]>();
  for (const { key, row } of nearestByCosine.values()) s1Pool.set(key, row);
  const s1Sorted = [...s1Pool.values()].sort((x, y) => y.diag.embeddingCosine - x.diag.embeddingCosine);
  sizes.S1.pool = s1Sorted.length;
  addSelected("S1", s1Sorted.slice(0, STRATUM_TARGET));

  // S2 — live merge rule would join. Seeded random draw of the pool.
  const s2Pool = withDiag.filter((r) => r.diag.liveMergeJoins && !used.has(r.key));
  sizes.S2.pool = s2Pool.length;
  addSelected("S2", seededShuffle(s2Pool, seed).slice(0, STRATUM_TARGET));

  // S3 — same story-threads group, not already in S2. Seeded random draw.
  const s3Pool = withDiag.filter((r) => r.diag.storyThreadsJoins && !used.has(r.key));
  sizes.S3.pool = s3Pool.length;
  addSelected("S3", seededShuffle(s3Pool, seed).slice(0, STRATUM_TARGET));

  // S4 — control: same country or same primary asset. Random draw.
  const s4Pool = withDiag.filter((r) => {
    if (used.has(r.key)) return false;
    const sameCountry = r.a.country !== null && r.a.country === r.b.country;
    const samePrimaryAsset = r.a.primaryAsset !== null && r.a.primaryAsset === r.b.primaryAsset;
    return sameCountry || samePrimaryAsset;
  });
  sizes.S4.pool = s4Pool.length;
  addSelected("S4", seededShuffle(s4Pool, seed).slice(0, STRATUM_TARGET));

  const shuffled = seededShuffle(pairs, seed);
  shuffled.forEach((p, i) => {
    p.pairId = `p${String(i + 1).padStart(2, "0")}`;
  });

  return { pairs: shuffled, sizes };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const CSV_HEADER = [
  "pair_id",
  "A_title",
  "A_summary",
  "A_published",
  "A_feed",
  "A_url",
  "B_title",
  "B_summary",
  "B_published",
  "B_feed",
  "B_url",
  "hours_apart",
  "label",
];

export function renderCsv(pairs: LabelPair[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const p of pairs) {
    // A is the earlier-created signal of the pair, for a stable, score-free ordering.
    const [a, b] = Date.parse(p.a.created_at) <= Date.parse(p.b.created_at) ? [p.a, p.b] : [p.b, p.a];
    lines.push(
      [
        p.pairId,
        csvEscape(a.title),
        csvEscape(a.summary ?? ""),
        a.created_at,
        csvEscape(a.feed),
        a.url ?? "",
        csvEscape(b.title),
        csvEscape(b.summary ?? ""),
        b.created_at,
        csvEscape(b.feed),
        b.url ?? "",
        p.hoursApart.toFixed(2),
        "",
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export function buildKeyJson(pairs: LabelPair[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of pairs) {
    out[p.pairId] = {
      stratum: p.stratum,
      signalIds: [p.a.id, p.b.id],
      summaryJaccard: p.summaryJaccard,
      titleJaccard: p.titleJaccard,
      embeddingCosine: p.embeddingCosine,
      eventCategoryEqual: p.eventCategoryEqual,
      countryEqual: p.countryEqual,
      sharedAsset: p.sharedAsset,
      liveMergeJoins: p.liveMergeJoins,
      storyThreadsJoins: p.storyThreadsJoins,
    };
  }
  return out;
}

const INSTRUCTIONS_MD = `# Labelling instructions

For each pair in pairs-to-label.csv, fill in the \`label\` column with exactly one of:

- \`same event\` — A and B describe the same real-world occurrence, even if worded differently.
- \`update\` — B (or A) is a later report of the same event that adds something new.
- \`different\` — a different occurrence, even if related, in the same country, or about the same asset.
- \`cannot tell\` — you cannot judge from the given text.

If unsure, open the source link in A_url or B_url before guessing.
`;

type SignalRow = {
  id: string;
  created_at: string;
  event_date: string;
  title: string | null;
  summary: string | null;
  event_category: string | null;
  country: string | null;
  region: string | null;
  commodity_impacts: unknown;
  raw_event_ids: string[] | null;
  sources_count: number | null;
};

async function loadWindowSignals(): Promise<SignalRow[]> {
  const supabase = getSupabaseAdmin();
  const rows: SignalRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("signals")
      .select(
        "id,created_at,event_date,title,summary,event_category,country,region,commodity_impacts,raw_event_ids,sources_count",
      )
      .gte("created_at", WINDOW_START)
      .lt("created_at", WINDOW_END)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as SignalRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function loadRawEventMeta(ids: string[]): Promise<Map<string, { feed: string; url: string | null }>> {
  const supabase = getSupabaseAdmin();
  const map = new Map<string, { feed: string; url: string | null }>();
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    if (batch.length === 0) continue;
    const { data, error } = await supabase.from("raw_events").select("id, source, raw_data").in("id", batch);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ id: string; source: string | null; raw_data: unknown }>) {
      map.set(String(row.id), {
        feed: feedLabel({ source: row.source, raw_data: row.raw_data as Record<string, unknown> | null }),
        url: urlFromRawData(row.raw_data),
      });
    }
  }
  return map;
}

async function toPoolSignals(rows: SignalRow[]): Promise<PoolSignal[]> {
  const firstRawEventId = new Map<string, string>();
  for (const row of rows) {
    const first = (row.raw_event_ids ?? [])[0];
    if (first) firstRawEventId.set(row.id, first);
  }
  const meta = await loadRawEventMeta([...new Set(firstRawEventId.values())]);

  return rows.map((row) => {
    const symbols = symbolsFromImpacts(row.commodity_impacts);
    const rawEventId = firstRawEventId.get(row.id);
    const rawMeta = rawEventId ? meta.get(rawEventId) : undefined;
    return {
      id: row.id,
      created_at: row.created_at,
      event_date: row.event_date,
      title: row.title ?? "",
      summary: row.summary,
      event_category: row.event_category,
      country: row.country,
      region: row.region,
      symbols,
      primaryAsset: symbols[0] ?? null,
      feed: rawMeta?.feed ?? "unknown-no-raw-event",
      url: rawMeta?.url ?? null,
    };
  });
}

type EmbeddingRow = { content_key: string; embedding: unknown; embedding_model: string };

function parseVector(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(Number) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Read-only reuse check against search_content_embeddings — never writes there. */
async function loadReusableEmbeddings(
  ids: string[],
  model: string,
): Promise<Map<string, number[]>> {
  const supabase = getSupabaseAdmin();
  const map = new Map<string, number[]>();
  const keys = ids.map((id) => `signal:${id}`);
  const CHUNK = 500;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const batch = keys.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("search_content_embeddings")
      .select("content_key, embedding, embedding_model")
      .in("content_key", batch);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as EmbeddingRow[]) {
      if (row.embedding_model !== model) continue;
      const vec = parseVector(row.embedding);
      if (vec) map.set(row.content_key.slice("signal:".length), vec);
    }
  }
  return map;
}

async function embedPool(signals: PoolSignal[], forceLocal: boolean): Promise<Map<string, number[]>> {
  const model = forceLocal ? LOCAL_HASH_MODEL : activeEmbeddingModel();
  const reused = await loadReusableEmbeddings(signals.map((s) => s.id), model);
  const toEmbed = signals.filter((s) => !reused.has(s.id));
  const texts = toEmbed.map((s) => `${s.title}. ${s.summary ?? ""}`);
  const fresh = texts.length > 0 ? await embedTexts(texts, "document", model) : [];
  const byId = new Map(reused);
  toEmbed.forEach((s, i) => byId.set(s.id, fresh[i]!));
  console.log(`[sample:pairs] embedding model=${model} embedded=${texts.length} reused=${reused.size}`);
  return byId;
}

function cosineLookup(embeddings: Map<string, number[]>) {
  return (aId: string, bId: string): number => {
    const a = embeddings.get(aId);
    const b = embeddings.get(bId);
    if (!a || !b) return 0;
    return cosineSimilarity(a, b);
  };
}

function parseArgs(argv: string[]) {
  const dry = argv.includes("--dry");
  let seed = DEFAULT_SEED;
  const seedIdx = argv.indexOf("--seed");
  if (seedIdx !== -1 && argv[seedIdx + 1]) {
    const n = Number(argv[seedIdx + 1]);
    if (Number.isFinite(n)) seed = Math.floor(n);
  }
  return { dry, seed };
}

async function main() {
  const { dry, seed } = parseArgs(process.argv.slice(2));

  const rows = await loadWindowSignals();
  const signals = await toPoolSignals(rows);

  const model = dry ? LOCAL_HASH_MODEL : activeEmbeddingModel();
  if (model === LOCAL_HASH_MODEL) {
    console.log(`[sample:pairs] local-hash-v1 active (no VOYAGE_API_KEY, or --dry forces it) — no paid calls made`);
  }

  console.log(`[sample:pairs] window=${WINDOW_START}..${WINDOW_END} signals=${signals.length} seed=${seed}`);

  const embeddings = await embedPool(signals, dry);
  const { pairs, sizes } = buildStrata(signals, cosineLookup(embeddings), seed);

  for (const stratum of ["S1", "S2", "S3", "S4"] as const) {
    console.log(`[sample:pairs] ${stratum} pool=${sizes[stratum].pool} selected=${sizes[stratum].selected}`);
  }

  if (dry) {
    console.log(`[sample:pairs] --dry: sample of ${Math.min(3, pairs.length)} pairs (no files written)`);
    for (const p of pairs.slice(0, 3)) {
      console.log(`  ${p.pairId} [${p.stratum}] "${p.a.title}" <-> "${p.b.title}"`);
    }
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CSV_PATH, renderCsv(pairs), "utf8");
  writeFileSync(KEY_PATH, JSON.stringify(buildKeyJson(pairs), null, 2), "utf8");
  writeFileSync(INSTRUCTIONS_PATH, INSTRUCTIONS_MD, "utf8");
  console.log(`[sample:pairs] wrote ${pairs.length} pairs to ${CSV_PATH}`);
  console.log(`[sample:pairs] wrote key to ${KEY_PATH}`);
  console.log(`[sample:pairs] wrote instructions to ${INSTRUCTIONS_PATH}`);
}

function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /[/\\]sample-event-pairs\.(ts|js)$/.test(entry);
}

if (isEntrypoint()) {
  main().catch((err) => {
    console.error("[sample:pairs] fatal:", err);
    process.exit(1);
  });
}
