import type { Signal } from "@blue-beacon-research/shared";

/**
 * Story threads: groups feed rows that look like reports of the same story.
 *
 * ENGINEERING CHOICE, NO PUBLISHED SOURCE. The rule below was picked on 2026-10-17
 * to collapse near-duplicate rows (for example eight rows of one sanctions story,
 * each with one report). It is a heuristic, not a research result. How well it
 * works is checked by the read-only `measure:story-threads` script in apps/backend
 * (group counts and a seeded sample of threads over the last 48 hours). That script
 * keeps its own copy of this rule; the two are not tied by a parity test.
 *
 * Two rows are linked when ALL of these hold:
 *   1. created_at values are within 24 hours of each other;
 *   2. both have the same, non-null event category;
 *   3. at least one symbol appears in both rows' commodity impacts;
 *   4. their titles share at least 2 words of 4+ letters, OR the word sets have a
 *      Jaccard overlap (shared / union) of at least 0.4.
 * Title words: lowercase, punctuation stripped, words under 4 letters dropped
 * (length is checked on the word as written), then one trailing "s" removed.
 * Qualifying pairs are joined with a single link (connected components), so a
 * chain A-B, B-C puts all three in one thread. Nothing is hidden or deleted:
 * every input row ends up in exactly one output item.
 */

export const THREAD_WINDOW_MS = 24 * 60 * 60 * 1000;
export const THREAD_MIN_SHARED_WORDS = 2;
export const THREAD_MIN_OVERLAP = 0.4;

export type ThreadableSignal = Pick<
  Signal,
  "id" | "title" | "createdAt" | "severity" | "sourcesCount" | "commodityImpacts" | "eventCategory"
>;

export type StoryThread<T extends ThreadableSignal = Signal> = {
  /** Stable id: the lead row's id. */
  id: string;
  /** Highest severity first; ties go to the newest. */
  lead: T;
  /** Every row in the thread, newest first (lead included). */
  members: T[];
  /** Union of impact symbols across members, in first-seen order. */
  markets: string[];
  /** Sum of each member's reports count. Not estimated. */
  totalReports: number;
  /** created_at of the newest member. */
  newestAt: string;
};

export type FeedItem<T extends ThreadableSignal = Signal> =
  | { kind: "thread"; thread: StoryThread<T> }
  | { kind: "single"; signal: T };

export function titleWords(title: string | null | undefined): Set<string> {
  const out = new Set<string>();
  const cleaned = (title ?? "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ");
  for (const raw of cleaned.split(/\s+/)) {
    if (raw.length < 4) continue;
    out.add(raw.endsWith("s") ? raw.slice(0, -1) : raw);
  }
  return out;
}

function symbolsOf(s: ThreadableSignal): Set<string> {
  return new Set((s.commodityImpacts ?? []).map((c) => c.asset).filter(Boolean));
}

function ts(s: ThreadableSignal): number {
  return Date.parse(s.createdAt);
}

/** True when the title rule (shared words or overlap) holds. */
export function titlesRelated(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  if (shared >= THREAD_MIN_SHARED_WORDS) return true;
  const union = a.size + b.size - shared;
  return union > 0 && shared / union >= THREAD_MIN_OVERLAP;
}

export function sameStory(a: ThreadableSignal, b: ThreadableSignal): boolean {
  const ta = ts(a);
  const tb = ts(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  if (Math.abs(ta - tb) > THREAD_WINDOW_MS) return false;
  if (!a.eventCategory || a.eventCategory !== b.eventCategory) return false;
  const sa = symbolsOf(a);
  let shareSymbol = false;
  for (const s of symbolsOf(b)) {
    if (sa.has(s)) {
      shareSymbol = true;
      break;
    }
  }
  if (!shareSymbol) return false;
  return titlesRelated(titleWords(a.title), titleWords(b.title));
}

function pickLead<T extends ThreadableSignal>(rows: T[]): T {
  return rows.reduce((best, r) => {
    if (r.severity !== best.severity) return r.severity > best.severity ? r : best;
    return ts(r) > ts(best) ? r : best;
  });
}

/**
 * Groups rows into threads, keeping feed order: a thread sits where its first
 * member appeared. Rows with no related row come back as `single`.
 */
export function groupStoryThreads<T extends ThreadableSignal>(signals: readonly T[]): FeedItem<T>[] {
  const n = signals.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const words = signals.map((s) => titleWords(s.title));
  const symbols = signals.map((s) => symbolsOf(s));

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (find(i) === find(j)) continue;
      const a = signals[i];
      const b = signals[j];
      const ta = ts(a);
      const tb = ts(b);
      if (!Number.isFinite(ta) || !Number.isFinite(tb)) continue;
      if (Math.abs(ta - tb) > THREAD_WINDOW_MS) continue;
      if (!a.eventCategory || a.eventCategory !== b.eventCategory) continue;
      let share = false;
      for (const s of symbols[j]) {
        if (symbols[i].has(s)) {
          share = true;
          break;
        }
      }
      if (!share) continue;
      if (!titlesRelated(words[i], words[j])) continue;
      parent[find(j)] = find(i);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(i);
    else groups.set(root, [i]);
  }

  const items: FeedItem<T>[] = [];
  const emitted = new Set<number>();
  for (let i = 0; i < n; i += 1) {
    const root = find(i);
    if (emitted.has(root)) continue;
    emitted.add(root);
    const idx = groups.get(root) ?? [i];
    if (idx.length === 1) {
      items.push({ kind: "single", signal: signals[i] });
      continue;
    }
    const rows = idx.map((k) => signals[k]);
    const lead = pickLead(rows);
    const members = [...rows].sort((x, y) => ts(y) - ts(x));
    const markets: string[] = [];
    for (const r of rows) {
      for (const c of r.commodityImpacts ?? []) {
        if (c.asset && !markets.includes(c.asset)) markets.push(c.asset);
      }
    }
    items.push({
      kind: "thread",
      thread: {
        id: lead.id,
        lead,
        members,
        markets,
        totalReports: rows.reduce((sum, r) => sum + (Number.isFinite(r.sourcesCount) ? r.sourcesCount : 0), 0),
        newestAt: members[0].createdAt,
      },
    });
  }
  return items;
}
