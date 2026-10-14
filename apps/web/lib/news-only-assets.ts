import {
  COMMODITIES,
  FOREX_PAIRS,
  NEWS_ONLY_COMMODITIES,
} from "@blue-beacon-research/shared";

/** Shown on a news-only watchlist card and on its detail page. */
export const NEWS_ONLY_FEED_LABEL = "News only (no price feed)";

export const NEWS_ONLY_SYMBOLS = NEWS_ONLY_COMMODITIES.map((c) => c.symbol);

const NEWS_ONLY_SYMBOL_SET = new Set<string>(NEWS_ONLY_SYMBOLS);

/**
 * Symbols a saved watchlist may keep. Priced commodities, the seven
 * news-only commodities, and forex pairs. Unknown symbols are dropped on
 * read and on write so a retired code cannot stick.
 */
export const KNOWN_WATCHLIST = new Set<string>([
  ...COMMODITIES.map((c) => c.symbol),
  ...NEWS_ONLY_SYMBOLS,
  ...FOREX_PAIRS.map((f) => f.symbol),
]);

export function isNewsOnlySymbol(symbol: string): boolean {
  return NEWS_ONLY_SYMBOL_SET.has(symbol.toUpperCase());
}

export function newsOnlyAsset(symbol: string) {
  const key = symbol.toUpperCase();
  return NEWS_ONLY_COMMODITIES.find((c) => c.symbol === key) ?? null;
}

/** Market-list suffix. The card and detail page use NEWS_ONLY_FEED_LABEL. */
export function newsOnlyMarketLabel(label: string): string {
  return `${label} (news only)`;
}

export function followMarketOptions(): { symbol: string; label: string }[] {
  return [
    ...COMMODITIES.map((c) => ({ symbol: c.symbol, label: c.label })),
    ...NEWS_ONLY_COMMODITIES.map((c) => ({
      symbol: c.symbol,
      label: newsOnlyMarketLabel(c.label),
    })),
  ];
}

export function signalCountLabel(count: number): string {
  return `${count} signal${count === 1 ? "" : "s"} in the last 7 days`;
}

export type NewsOnlyCardSignals = {
  count: number | null;
  headline: string | null;
  headlineAt: string | null;
};

type NewsOnlySignalRow = {
  title?: string | null;
  eventDate?: string | null;
  createdAt?: string | null;
};

/**
 * Same route the detail page uses (`GET /api/signals`), with `window=7d`,
 * `sort=newest`, and `limit=1`. That response already includes `total`, so
 * one request is both the latest headline and the 7-day count.
 */
export function newsOnlyCardSignalsUrl(symbol: string): string {
  return `/api/signals?commodity=${encodeURIComponent(symbol)}&window=7d&sort=newest&limit=1&page=1`;
}

export function parseNewsOnlyCardSignals(json: {
  signals?: NewsOnlySignalRow[];
  total?: unknown;
}): NewsOnlyCardSignals {
  const first = json.signals?.[0];
  const count =
    typeof json.total === "number" && Number.isFinite(json.total) ? json.total : null;
  const title = typeof first?.title === "string" ? first.title.trim() : "";
  const headlineAt =
    (typeof first?.eventDate === "string" && first.eventDate) ||
    (typeof first?.createdAt === "string" && first.createdAt) ||
    null;
  return {
    count,
    headline: title ? title : null,
    headlineAt,
  };
}

export async function fetchNewsOnlyCardSignals(
  symbol: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NewsOnlyCardSignals> {
  const res = await fetchImpl(newsOnlyCardSignalsUrl(symbol));
  if (!res.ok) throw new Error("news_only_signals_failed");
  const json = (await res.json()) as { signals?: NewsOnlySignalRow[]; total?: unknown };
  return parseNewsOnlyCardSignals(json);
}

export type PriceRequestKind = "latest" | "history" | "history5y";

/** Matches the detail page's 90-day DB history window. */
export const SYMBOL_PAGE_HISTORY_DAYS = 90;

/**
 * Returns null for a news-only symbol so the caller does not hit a price
 * route. Priced symbols get the same three URLs the detail page already used.
 */
export function priceRequestUrl(symbol: string, kind: PriceRequestKind): string | null {
  if (isNewsOnlySymbol(symbol)) return null;
  if (kind === "latest") return "/api/prices";
  const encoded = encodeURIComponent(symbol);
  if (kind === "history") {
    return `/api/prices/history?symbol=${encoded}&days=${SYMBOL_PAGE_HISTORY_DAYS}`;
  }
  return `/api/prices/history-5y?symbol=${encoded}`;
}

export async function fetchPriceRequest(
  symbol: string,
  kind: PriceRequestKind,
  fetchImpl: typeof fetch = fetch,
): Promise<Response | null> {
  const url = priceRequestUrl(symbol, kind);
  if (!url) return null;
  return fetchImpl(url);
}
