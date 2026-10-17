export type ThreadSignal = {
  id: string;
  title: string;
  event_category: string | null;
  symbols: string[];
  created_at: string;
};

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MIN_SHARED_WORDS = 2;
const MIN_JACCARD = 0.4;
const MIN_WORD_LENGTH = 4;

/** Lowercase, punctuation stripped, words of 4+ letters, trailing "s" removed. */
export function titleWordSet(title: string): Set<string> {
  const cleaned = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!cleaned) return new Set();
  const words = cleaned.split(/\s+/).filter((w) => w.length >= MIN_WORD_LENGTH);
  return new Set(words.map((w) => (w.endsWith("s") ? w.slice(0, -1) : w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function titlesBelongTogether(a: string, b: string): boolean {
  const wa = titleWordSet(a);
  const wb = titleWordSet(b);
  let shared = 0;
  for (const word of wa) {
    if (wb.has(word)) shared += 1;
  }
  if (shared >= MIN_SHARED_WORDS) return true;
  return jaccard(wa, wb) >= MIN_JACCARD;
}

export function shareASymbol(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const other = new Set(b);
  return a.some((s) => other.has(s));
}

export function createdWithin24h(aIso: string, bIso: string): boolean {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= TWENTY_FOUR_HOURS_MS;
}

export function pairBelongsTogether(a: ThreadSignal, b: ThreadSignal): boolean {
  if (!createdWithin24h(a.created_at, b.created_at)) return false;
  if (a.event_category !== b.event_category) return false;
  if (!shareASymbol(a.symbols, b.symbols)) return false;
  return titlesBelongTogether(a.title, b.title);
}

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let cur = i;
    while (this.parent[cur] !== cur) {
      this.parent[cur] = this.parent[this.parent[cur]];
      cur = this.parent[cur];
    }
    return cur;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

/** Connected components: one link between a qualifying pair is enough. */
export function buildStoryThreads(signals: ThreadSignal[]): ThreadSignal[][] {
  const n = signals.length;
  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pairBelongsTogether(signals[i], signals[j])) uf.union(i, j);
    }
  }
  const groups = new Map<number, ThreadSignal[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const list = groups.get(root) ?? [];
    list.push(signals[i]);
    groups.set(root, list);
  }
  return [...groups.values()].map((thread) =>
    [...thread].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
  );
}

export function threadStats(threads: ThreadSignal[][]) {
  const sizes = threads.map((t) => t.length);
  const signals = sizes.reduce((sum, n) => sum + n, 0);
  const size1 = sizes.filter((n) => n === 1).length;
  const size2to3 = sizes.filter((n) => n === 2 || n === 3).length;
  const size4plus = sizes.filter((n) => n >= 4).length;
  const largest = sizes.reduce((max, n) => (n > max ? n : max), 0);
  const inSize2plus = sizes.filter((n) => n >= 2).reduce((sum, n) => sum + n, 0);
  const share = signals === 0 ? 0 : inSize2plus / signals;
  return {
    signals,
    threads: threads.length,
    size1,
    size2to3,
    size4plus,
    largest,
    shareInSize2plus: share,
  };
}
