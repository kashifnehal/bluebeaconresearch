/**
 * Read-only measurement of story-thread grouping candidates over the last 7
 * days of signals. Writes a markdown report to scripts/out/ (git-ignored by
 * the top-level `out/` pattern). Does not write to the database, and does not
 * change any UI or production grouping behavior.
 *
 * Three candidate rules, run side by side:
 *   A — the current rule (story-threads.ts pairBelongsTogether): same
 *       event_category, a shared symbol, 24h proximity, title-word overlap
 *       (shared words >= 2 or Jaccard >= 0.4). This is what's live today.
 *   B — same event_category AND same primary symbol (first entry in
 *       commodity_impacts, as stored — not re-ranked) within 6 hours, with
 *       Jaccard of title words >= 0.5.
 *   C — same linked raw_event cluster only: signals that share a
 *       raw_event_id, or whose raw_events resolve to the exact same source
 *       URL (apps/backend/src/lib/signal-source-urls.ts's notion of a
 *       source URL). No category/symbol/time check at all.
 *
 * B's 6h window and 0.5 Jaccard, and C's "shared raw_event or URL" test, are
 * CANDIDATES — not researched, not benchmarked against anything. This script
 * does not pick a winner; it only prints what each rule would produce so a
 * human can compare them.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getSupabaseAdmin } from "../clients/supabase.js";
import {
  buildGroups,
  jaccard,
  titleWordSet,
  createdWithin24h,
  pairBelongsTogether,
  threadStats,
  type ThreadSignal,
} from "../lib/story-threads.js";

const LOOKBACK_DAYS = 7;
const LOOKBACK_HOURS = LOOKBACK_DAYS * 24;
const PAGE_SIZE = 1000;
const OUT_DIR = new URL("./out/", import.meta.url);
const OUT_PATH = new URL("./story-thread-rules-comparison.md", OUT_DIR);
const SAMPLE_SIZE = 40;
const DEFAULT_SEED = 20261017;

// Rule B thresholds — DESIGN CHOICE, not measured (candidate from the task spec).
const RULE_B_WINDOW_MS = 6 * 60 * 60 * 1000;
const RULE_B_MIN_JACCARD = 0.5;

type SignalRow = {
  id: string;
  title: string | null;
  summary: string | null;
  region: string | null;
  event_category: string | null;
  commodity_impacts: unknown;
  created_at: string;
  sources_count: number | null;
  raw_event_ids: string[] | null;
};

type ExtendedThreadSignal = ThreadSignal & {
  primarySymbol: string | null;
  rawEventIds: string[];
  clusterKeys: Set<string>;
  region: string | null;
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
// the raw_events row, never invented" rule.
function urlFromRawData(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== "object") return null;
  const url = (rawData as { url?: unknown }).url;
  if (typeof url === "string" && /^https?:\/\//i.test(url.trim())) return url.trim();
  return null;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickSample<T>(items: T[], count: number, rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, Math.min(count, copy.length));
}

async function loadRecentSignals(): Promise<SignalRow[]> {
  const supabase = getSupabaseAdmin();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const rows: SignalRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("signals")
      .select("id,title,summary,region,event_category,commodity_impacts,created_at,sources_count,raw_event_ids")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as SignalRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function loadRawEventUrls(rawEventIds: string[]): Promise<Map<string, string>> {
  const supabase = getSupabaseAdmin();
  const map = new Map<string, string>();
  const CHUNK = 500;
  for (let i = 0; i < rawEventIds.length; i += CHUNK) {
    const batch = rawEventIds.slice(i, i + CHUNK);
    if (batch.length === 0) continue;
    const { data, error } = await supabase.from("raw_events").select("id, raw_data").in("id", batch);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ id: string; raw_data: unknown }>) {
      const url = urlFromRawData(row.raw_data);
      if (url) map.set(String(row.id), url);
    }
  }
  return map;
}

async function toExtendedSignals(rows: SignalRow[]): Promise<ExtendedThreadSignal[]> {
  const allRawEventIds = [...new Set(rows.flatMap((r) => r.raw_event_ids ?? []))];
  const urlById = await loadRawEventUrls(allRawEventIds);

  return rows.map((row) => {
    const symbols = symbolsFromImpacts(row.commodity_impacts);
    const rawEventIds = row.raw_event_ids ?? [];
    const clusterKeys = new Set<string>();
    for (const id of rawEventIds) {
      clusterKeys.add(`id:${id}`);
      const url = urlById.get(id);
      if (url) clusterKeys.add(`url:${url}`);
    }
    return {
      id: row.id,
      title: row.title ?? "",
      event_category: row.event_category,
      symbols,
      created_at: row.created_at,
      primarySymbol: symbols[0] ?? null,
      rawEventIds,
      clusterKeys,
      region: row.region,
    };
  });
}

// Rule A — the current production rule, unchanged.
function ruleA(signals: ExtendedThreadSignal[]): ExtendedThreadSignal[][] {
  return buildGroups(signals, pairBelongsTogether);
}

// Rule B — same category, same primary symbol, 6h window, Jaccard >= 0.5.
// DESIGN CHOICE thresholds (candidate from the task spec, not measured).
function ruleB(signals: ExtendedThreadSignal[]): ExtendedThreadSignal[][] {
  return buildGroups(signals, (a, b) => {
    if (a.event_category !== b.event_category) return false;
    if (a.primarySymbol === null || a.primarySymbol !== b.primarySymbol) return false;
    const aTime = Date.parse(a.created_at);
    const bTime = Date.parse(b.created_at);
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return false;
    if (Math.abs(aTime - bTime) > RULE_B_WINDOW_MS) return false;
    return jaccard(titleWordSet(a.title), titleWordSet(b.title)) >= RULE_B_MIN_JACCARD;
  });
}

// Rule C — same linked raw_event cluster only: shared raw_event_id, or
// raw_events resolving to the exact same source URL. No time/category/symbol
// check. DESIGN CHOICE (candidate from the task spec, not measured).
function ruleC(signals: ExtendedThreadSignal[]): ExtendedThreadSignal[][] {
  return buildGroups(signals, (a, b) => {
    for (const key of a.clusterKeys) {
      if (b.clusterKeys.has(key)) return true;
    }
    return false;
  });
}

function renderRuleSection(
  label: string,
  description: string,
  threads: ExtendedThreadSignal[][],
  seed: number,
): string {
  const stats = threadStats(threads);
  const sizeCounts = new Map<number, number>();
  for (const thread of threads) sizeCounts.set(thread.length, (sizeCounts.get(thread.length) ?? 0) + 1);
  const exactHistogram = [...sizeCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([size, count]) => `${size}=${count}`)
    .join(", ");
  const sharePct = (stats.shareInSize2plus * 100).toFixed(1);
  const multi = threads.filter((t) => t.length >= 2);
  const rng = mulberry32(seed);
  const sample = pickSample(multi, SAMPLE_SIZE, rng);

  const lines = [
    `## Rule ${label}`,
    ``,
    description,
    ``,
    `- signals: ${stats.signals}`,
    `- groups: ${stats.threads}`,
    `- size histogram: size 1 = ${stats.size1}, size 2–3 = ${stats.size2to3}, size 4+ = ${stats.size4plus}`,
    `- exact size histogram (size=group count): ${exactHistogram || "none"}`,
    `- largest group size: ${stats.largest}`,
    `- share of signals in a group of size 2+: ${stats.shareInSize2plus.toFixed(4)} (${sharePct}%)`,
    `- groups of size 2+ in this run: ${multi.length}`,
    ``,
    `### Sample of ${sample.length} random groups (size 2+), seed ${seed}`,
    ``,
  ];
  sample.forEach((group, i) => {
    lines.push(`**Group ${i + 1}** (size ${group.length})`);
    for (const member of group) {
      lines.push(`- ${member.created_at} — ${member.region || "(no region)"} — ${member.title}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

export async function compareStoryThreadRules(seed = DEFAULT_SEED) {
  const rows = await loadRecentSignals();
  const signals = await toExtendedSignals(rows);

  const threadsA = ruleA(signals);
  const threadsB = ruleB(signals);
  const threadsC = ruleC(signals);

  const header = [
    `# Story-thread grouping: three candidate rules, last ${LOOKBACK_DAYS} days`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Signals in window: ${signals.length}`,
    ``,
    `Rule A is the current production rule. Rules B and C are candidates from`,
    `the task spec; their thresholds (B's 6h/Jaccard>=0.5, C's "shared`,
    `raw_event or URL" test) are not researched or benchmarked. This report`,
    `does not pick a winner — it's a side-by-side comparison for a human to`,
    `read.`,
    ``,
  ].join("\n");

  const sectionA = renderRuleSection(
    "A (current)",
    "Same event_category, a shared symbol, 24h proximity, and shared title words (story-threads.ts pairBelongsTogether — unchanged).",
    threadsA,
    seed,
  );
  const sectionB = renderRuleSection(
    "B (candidate)",
    `Same event_category AND same primary symbol (first commodity_impacts entry, as stored), within 6h, Jaccard of title words >= ${RULE_B_MIN_JACCARD}.`,
    threadsB,
    seed,
  );
  const sectionC = renderRuleSection(
    "C (candidate)",
    "Same linked raw_event cluster only: signals sharing a raw_event_id, or whose raw_events resolve to the exact same source URL. No category/symbol/time check.",
    threadsC,
    seed,
  );

  const report = [header, sectionA, "", sectionB, "", sectionC, ""].join("\n");

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, report, "utf8");

  for (const [label, threads] of [
    ["A", threadsA],
    ["B", threadsB],
    ["C", threadsC],
  ] as const) {
    const stats = threadStats(threads);
    const sizeCounts = new Map<number, number>();
    for (const thread of threads) sizeCounts.set(thread.length, (sizeCounts.get(thread.length) ?? 0) + 1);
    const exactHistogram = [...sizeCounts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([size, count]) => `${size}=${count}`)
      .join(", ");
    console.log(
      `rule ${label}: groups=${stats.threads} size1=${stats.size1} size2to3=${stats.size2to3} size4plus=${stats.size4plus} largest=${stats.largest} share2plus=${stats.shareInSize2plus.toFixed(4)} histogram=${exactHistogram}`,
    );
  }
  console.log(`report written to ${OUT_PATH.pathname}`);

  return { threadsA, threadsB, threadsC };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  compareStoryThreadRules().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
