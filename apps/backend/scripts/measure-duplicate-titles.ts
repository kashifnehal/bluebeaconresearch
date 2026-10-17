/**
 * Read-only measurement: why same-title signals created within
 * MATCH_WINDOW_HOURS were not merged by findMergeCandidate.
 *
 * Looks at signals created in the last 30 days. A pair is two different
 * rows with the same normalized title (lower case, trimmed, collapsed
 * spaces) whose created_at values are at most MATCH_WINDOW_HOURS apart.
 * Separate rows were not merged. Blank titles are excluded and counted.
 *
 * The later row is treated as the incoming article. The first reason is
 * the earliest check in findMergeCandidate that would skip the earlier
 * row: region empty or global, region differs, event_date outside the
 * window, not in the 25-candidate limit, country conflict, then summary
 * Jaccard under SIMILARITY_THRESHOLD. Scoring uses tokenize and
 * jaccardSimilarity from signal-merge.ts. This file does not insert or
 * update anything.
 *
 * Writes apps/backend/scripts/out/ (git-ignored). Prints the same summary.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getSupabaseAdmin } from "../src/clients/supabase.js";
import {
  CANDIDATE_LIMIT,
  MATCH_WINDOW_HOURS,
  SIMILARITY_THRESHOLD,
  countriesConflict,
  jaccardSimilarity,
  regionBlocksMerge,
  tokenize,
} from "../src/workers/signal-merge.js";

const LOOKBACK_DAYS = 30;
const PAGE_SIZE = 1000;
const EXAMPLE_LIMIT = 10;
const WINDOW_MS = MATCH_WINDOW_HOURS * 3_600_000;
const OUT_DIR = new URL("./out/", import.meta.url);
const OUT_PATH = new URL("./duplicate-title-pairs.md", OUT_DIR);

const REASONS = [
  "region empty or global",
  "region differs",
  "outside the candidate window",
  "beyond the 25-candidate limit",
  "inactive",
  "country differs",
  "summary Jaccard below threshold",
  "would have matched",
] as const;

type Reason = (typeof REASONS)[number];

type Row = {
  id: string;
  title: string | null;
  summary: string | null;
  region: string | null;
  country: string | null;
  event_date: string;
  created_at: string;
  is_active: boolean | null;
  createdMs: number;
};

type PairResult = {
  reason: Reason;
  jaccard: number;
  title: string;
  laterRegion: string;
  earlierRegion: string;
  laterCreated: string;
  tieCrossesCutoff: boolean;
};

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function topCandidates(
  incoming: Row,
  pool: Row[],
): { ids: Set<string>; tieCrossesCutoff: boolean } {
  const region = (incoming.region || "").trim();
  const t = Date.parse(incoming.event_date);
  const lo = t - WINDOW_MS;
  const hi = t + WINDOW_MS;
  const inWindow = pool.filter((row) => {
    if (row.id === incoming.id || row.is_active !== true) return false;
    if ((row.region ?? "") !== region) return false;
    const eventMs = Date.parse(row.event_date);
    return Number.isFinite(eventMs) && eventMs >= lo && eventMs <= hi;
  });
  inWindow.sort((a, b) => {
    const delta = Date.parse(b.event_date) - Date.parse(a.event_date);
    if (delta !== 0) return delta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const ids = new Set(inWindow.slice(0, CANDIDATE_LIMIT).map((row) => row.id));
  let tieCrossesCutoff = false;
  if (inWindow.length > CANDIDATE_LIMIT) {
    const atCutoff = Date.parse(inWindow[CANDIDATE_LIMIT - 1].event_date);
    const next = Date.parse(inWindow[CANDIDATE_LIMIT].event_date);
    tieCrossesCutoff = atCutoff === next;
  }
  return { ids, tieCrossesCutoff };
}

function firstReason(later: Row, earlier: Row, pool: Row[], cache: Map<string, { ids: Set<string>; tieCrossesCutoff: boolean }>): PairResult {
  const jaccard = jaccardSimilarity(tokenize(later.summary), tokenize(earlier.summary));
  const title = normalizeTitle(later.title);
  const base = {
    jaccard,
    title,
    laterRegion: later.region ?? "",
    earlierRegion: earlier.region ?? "",
    laterCreated: later.created_at,
    tieCrossesCutoff: false,
  };

  if (regionBlocksMerge(later.region)) {
    return { ...base, reason: "region empty or global" };
  }

  const laterRegion = (later.region || "").trim();
  if ((earlier.region ?? "") !== laterRegion) {
    return { ...base, reason: "region differs" };
  }

  const laterEvent = Date.parse(later.event_date);
  const earlierEvent = Date.parse(earlier.event_date);
  if (
    !Number.isFinite(laterEvent) ||
    !Number.isFinite(earlierEvent) ||
    earlierEvent < laterEvent - WINDOW_MS ||
    earlierEvent > laterEvent + WINDOW_MS
  ) {
    return { ...base, reason: "outside the candidate window" };
  }

  if (earlier.is_active !== true) {
    return { ...base, reason: "inactive" };
  }

  let top = cache.get(later.id);
  if (!top) {
    top = topCandidates(later, pool);
    cache.set(later.id, top);
  }
  if (!top.ids.has(earlier.id)) {
    return { ...base, reason: "beyond the 25-candidate limit", tieCrossesCutoff: top.tieCrossesCutoff };
  }
  if (countriesConflict(later.country, earlier.country)) {
    return { ...base, reason: "country differs" };
  }
  if (jaccard < SIMILARITY_THRESHOLD) {
    return { ...base, reason: "summary Jaccard below threshold" };
  }
  return { ...base, reason: "would have matched" };
}

async function loadPool(poolSinceIso: string): Promise<Row[]> {
  const supabase = getSupabaseAdmin();
  const rows: Row[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("signals")
      .select("id,title,summary,region,country,event_date,created_at,is_active")
      .or(`created_at.gte.${poolSinceIso},event_date.gte.${poolSinceIso}`)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as Array<Omit<Row, "createdMs">>;
    for (const row of page) {
      rows.push({ ...row, createdMs: Date.parse(row.created_at) });
    }
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function render(report: {
  signalsInWindow: number;
  poolRows: number;
  blankTitles: number;
  pairs: PairResult[];
  affected: number;
  tieCutoffPairs: number;
  windowStart: string;
}): string {
  const { pairs } = report;
  const counts = new Map<Reason, number>(REASONS.map((reason) => [reason, 0]));
  for (const pair of pairs) counts.set(pair.reason, (counts.get(pair.reason) ?? 0) + 1);
  const pctSignals = report.signalsInWindow === 0 ? 0 : (report.affected / report.signalsInWindow) * 100;
  const lines = [
    `# Same-title signals not merged`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `created_at >= ${report.windowStart} (${LOOKBACK_DAYS} days)`,
    `MATCH_WINDOW_HOURS=${MATCH_WINDOW_HOURS} SIMILARITY_THRESHOLD=${SIMILARITY_THRESHOLD} CANDIDATE_LIMIT=${CANDIDATE_LIMIT}`,
    ``,
    `- signals created in the window: ${report.signalsInWindow}`,
    `- rows loaded for the candidate pool (window plus ${MATCH_WINDOW_HOURS}h): ${report.poolRows}`,
    `- blank titles excluded: ${report.blankTitles}`,
    `- unmerged same-title pairs: ${pairs.length}`,
    `- signals in at least one pair: ${report.affected}`,
    `- percentage of signals affected: ${pctSignals.toFixed(1)}% (${report.affected}/${report.signalsInWindow})`,
    `- pairs whose 25-candidate cutoff sat on an equal event_date tie: ${report.tieCutoffPairs}`,
    ``,
    `## Counts by first reason`,
    ``,
  ];
  for (const reason of REASONS) {
    const count = counts.get(reason) ?? 0;
    const share = pairs.length === 0 ? 0 : (count / pairs.length) * 100;
    lines.push(`- ${reason}: ${count} (${share.toFixed(1)}% of pairs)`);
  }
  lines.push("", `## ${Math.min(EXAMPLE_LIMIT, pairs.length)} example pairs`, "");
  const examples = [...pairs].sort((a, b) => a.laterCreated.localeCompare(b.laterCreated) || a.title.localeCompare(b.title));
  examples.slice(0, EXAMPLE_LIMIT).forEach((pair, index) => {
    lines.push(
      `${index + 1}. ${pair.reason}; Jaccard ${pair.jaccard.toFixed(3)}; regions "${pair.earlierRegion}" -> "${pair.laterRegion}"; ${pair.title}`,
    );
  });
  if (pairs.length === 0) lines.push("(no pairs)");
  lines.push("");
  return lines.join("\n");
}

export async function measureDuplicateTitles(): Promise<string> {
  const now = Date.now();
  const windowStart = new Date(now - LOOKBACK_DAYS * 24 * 3_600_000);
  const poolSince = new Date(windowStart.getTime() - WINDOW_MS);
  const pool = await loadPool(poolSince.toISOString());
  const inWindow = pool.filter((row) => row.createdMs >= windowStart.getTime());

  const byTitle = new Map<string, Row[]>();
  let blankTitles = 0;
  for (const row of inWindow) {
    const title = normalizeTitle(row.title);
    if (!title) {
      blankTitles += 1;
      continue;
    }
    const list = byTitle.get(title) ?? [];
    list.push(row);
    byTitle.set(title, list);
  }

  const pairs: PairResult[] = [];
  const affected = new Set<string>();
  const cache = new Map<string, { ids: Set<string>; tieCrossesCutoff: boolean }>();
  let tieCutoffPairs = 0;

  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.createdMs - b.createdMs || (a.id < b.id ? -1 : 1));
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[j].createdMs - group[i].createdMs > WINDOW_MS) break;
        const earlier = group[i];
        const later = group[j];
        const result = firstReason(later, earlier, pool, cache);
        if (result.tieCrossesCutoff) tieCutoffPairs += 1;
        pairs.push(result);
        affected.add(earlier.id);
        affected.add(later.id);
      }
    }
  }

  const text = render({
    signalsInWindow: inWindow.length,
    poolRows: pool.length,
    blankTitles,
    pairs,
    affected: affected.size,
    tieCutoffPairs,
    windowStart: windowStart.toISOString(),
  });
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, text, "utf8");
  return text;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  measureDuplicateTitles()
    .then((text) => {
      console.log(text);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
