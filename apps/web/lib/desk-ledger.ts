import { COMMODITIES, FOREX_PAIRS, NEWS_ONLY_COMMODITIES } from "@blue-beacon-research/shared";

export type LedgerPulse = { last24h: number; prior24h: number } | null;

export type LedgerRow = {
  symbol: string;
  label: string;
  price: number | null;
  changePct: number | null;
  /** null = the pulse route could not answer for this symbol (shown as a dash). */
  pulse: LedgerPulse;
};

export const LEDGER_CONCURRENCY = 4;
export const LEDGER_STALE_MS = 60_000;
export const LEDGER_WATCHLIST_STORAGE_KEY = "bbr.watchlist.v1";

const LABELS = new Map<string, string>(
  [...COMMODITIES, ...FOREX_PAIRS, ...NEWS_ONLY_COMMODITIES].map((a) => [a.symbol, a.label]),
);

export const DEFAULT_LEDGER_SYMBOLS: string[] = COMMODITIES.map((c) => c.symbol);

export function ledgerLabel(symbol: string): string {
  return LABELS.get(symbol) ?? symbol;
}

/** Symbols the ledger may fetch: only what is already on the user's watchlist. */
export function resolveLedgerSymbols(
  server: readonly string[] | null | undefined,
  stored: readonly string[] | null | undefined,
  fallback: readonly string[] = DEFAULT_LEDGER_SYMBOLS,
): string[] {
  const pick = server && server.length > 0 ? server : stored && stored.length > 0 ? stored : fallback;
  return [...new Set(pick.filter((s) => LABELS.has(s)))];
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export function buildLedgerRows(
  symbols: readonly string[],
  prices: readonly { symbol: string; price?: number; change_pct_24h?: number; changePct24h?: number }[],
  pulses: Readonly<Record<string, LedgerPulse>>,
): LedgerRow[] {
  const bySymbol = new Map(prices.map((p) => [p.symbol, p]));
  return symbols.map((symbol) => {
    const p = bySymbol.get(symbol);
    const pct = p?.change_pct_24h ?? p?.changePct24h;
    return {
      symbol,
      label: ledgerLabel(symbol),
      price: typeof p?.price === "number" ? p.price : null,
      changePct: typeof pct === "number" ? pct : null,
      pulse: pulses[symbol] ?? null,
    };
  });
}

/** Largest absolute 24h move among rows that have a figure. Never invents one. */
export function biggestMover(rows: readonly LedgerRow[]): LedgerRow | null {
  let best: LedgerRow | null = null;
  for (const r of rows) {
    if (r.changePct == null) continue;
    if (!best || Math.abs(r.changePct) > Math.abs(best.changePct ?? 0)) best = r;
  }
  return best;
}

export function maxPulseCount(rows: readonly LedgerRow[]): number {
  let max = 0;
  for (const r of rows) {
    if (r.pulse) max = Math.max(max, r.pulse.last24h, r.pulse.prior24h);
  }
  return max;
}

/** Bar width in percent of the track; 0 count = 0 width. */
export function barWidthPct(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.max(4, Math.round((count / max) * 100));
}
