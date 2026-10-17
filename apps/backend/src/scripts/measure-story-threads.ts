/**
 * Read-only measurement of story-thread grouping on the last 48 hours of signals.
 * Writes /tmp/threads-sample.md. Does not write to the database.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { getSupabaseAdmin } from "../clients/supabase.js";
import {
  buildStoryThreads,
  threadStats,
  type ThreadSignal,
} from "../lib/story-threads.js";

const LOOKBACK_HOURS = 48;
const PAGE_SIZE = 1000;
const SAMPLE_PATH = "/tmp/threads-sample.md";
const SAMPLE_SIZE = 40;
const DEFAULT_SEED = 20261017;

type SignalRow = {
  id: string;
  title: string | null;
  summary: string | null;
  event_category: string | null;
  commodity_impacts: unknown;
  created_at: string;
  sources_count: number | null;
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
      .select("id,title,summary,event_category,commodity_impacts,created_at,sources_count")
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

function toThreadSignals(rows: SignalRow[]): ThreadSignal[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title ?? "",
    event_category: row.event_category,
    symbols: symbolsFromImpacts(row.commodity_impacts),
    created_at: row.created_at,
  }));
}

function renderSample(threads: ThreadSignal[][], seed: number): string {
  const lines = [
    `# Story-thread sample`,
    ``,
    `Seed: ${seed}`,
    `Threads of size 2+ in this file: ${threads.length}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
  ];
  threads.forEach((thread, i) => {
    lines.push(`## Thread ${i + 1} (size ${thread.length})`);
    for (const member of thread) {
      lines.push(`- ${member.created_at} — ${member.title}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

export async function measureStoryThreads(seed = DEFAULT_SEED) {
  const rows = await loadRecentSignals();
  const threads = buildStoryThreads(toThreadSignals(rows));
  const stats = threadStats(threads);
  const multi = threads.filter((t) => t.length >= 2);
  const rng = mulberry32(seed);
  const sample = pickSample(multi, SAMPLE_SIZE, rng);
  writeFileSync(SAMPLE_PATH, renderSample(sample, seed), "utf8");

  const sharePct = (stats.shareInSize2plus * 100).toFixed(1);
  console.log(`signals: ${stats.signals}`);
  console.log(`threads_size_1: ${stats.size1}`);
  console.log(`threads_size_2_to_3: ${stats.size2to3}`);
  console.log(`threads_size_4_or_more: ${stats.size4plus}`);
  console.log(`largest_thread_size: ${stats.largest}`);
  console.log(`share_in_thread_size_2_plus: ${stats.shareInSize2plus.toFixed(4)} (${sharePct}%)`);
  console.log(`seed: ${seed}`);
  console.log(`sample_path: ${SAMPLE_PATH}`);
  console.log(`sample_threads_written: ${sample.length}`);
  return stats;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  measureStoryThreads().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
