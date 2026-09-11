import type { FastifyInstance } from "fastify";
import YahooFinance from "yahoo-finance2";

// On-demand 5-year weekly chart (#106). Mirrors the Yahoo ticker map in
// workers/price-syncer.ts but is deliberately a separate copy — that job is
// unrelated (live quotes into commodity_prices on a schedule) and is not
// touched here. Unknown symbols never pass through to Yahoo (closed set).
const YAHOO_TICKERS: Record<string, string> = {
  USOIL: "CL=F",
  UKOIL: "BZ=F",
  XAUUSD: "GC=F",
  NGAS: "NG=F",
  WHEAT: "ZW=F",
  COPPER: "HG=F",
  XAGUSD: "SI=F",
  CORN: "ZC=F",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "USDJPY=X",
  USDCHF: "USDCHF=X",
  USDRUB: "USDRUB=X",
  USDCNY: "USDCNY=X",
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const INTERVAL = "1wk" as const;
// Weekly bars + weekends: treat a first-bar lag of up to 60 days as "full" 5y.
const INCOMPLETE_SLACK_MS = 60 * 24 * 60 * 60 * 1000;

type PricePoint = { price: number; fetchedAt: string };

export type History5yPayload = {
  symbol: string;
  yahooSymbol: string | null;
  interval: typeof INTERVAL;
  requestedFrom: string;
  availableFrom: string | null;
  availableTo: string | null;
  incomplete: boolean;
  points: PricePoint[];
};

type CacheEntry = { expiresAt: number; payload: History5yPayload };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<History5yPayload>>();

let yf: InstanceType<typeof YahooFinance> | null = null;
function getYahoo() {
  if (!yf) yf = new YahooFinance();
  return yf;
}

function fiveYearsAgo(): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 5);
  return d;
}

function emptyPayload(symbol: string, yahooSymbol: string | null, requestedFrom: string): History5yPayload {
  return {
    symbol,
    yahooSymbol,
    interval: INTERVAL,
    requestedFrom,
    availableFrom: null,
    availableTo: null,
    incomplete: true,
    points: [],
  };
}

function toPoints(quotes: Array<{ date?: Date | string | number; close?: number | null }> | undefined): PricePoint[] {
  const points: PricePoint[] = [];
  for (const q of quotes ?? []) {
    if (typeof q.close !== "number" || !Number.isFinite(q.close) || q.date == null) continue;
    const fetchedAt = q.date instanceof Date ? q.date.toISOString() : new Date(q.date).toISOString();
    if (Number.isNaN(new Date(fetchedAt).getTime())) continue;
    points.push({ price: q.close, fetchedAt });
  }
  points.sort((a, b) => new Date(a.fetchedAt).getTime() - new Date(b.fetchedAt).getTime());
  return points;
}

async function fetchHistory(symbol: string): Promise<History5yPayload> {
  const requestedFromDate = fiveYearsAgo();
  const requestedFrom = requestedFromDate.toISOString();
  const yahooSymbol = YAHOO_TICKERS[symbol] ?? null;

  if (!yahooSymbol) return emptyPayload(symbol, null, requestedFrom);

  try {
    const result = await getYahoo().chart(yahooSymbol, {
      period1: requestedFromDate,
      interval: INTERVAL,
    });
    const points = toPoints(result?.quotes);
    const availableFrom = points[0]?.fetchedAt ?? null;
    const availableTo = points[points.length - 1]?.fetchedAt ?? null;
    const firstMs = availableFrom ? new Date(availableFrom).getTime() : NaN;
    const incomplete =
      points.length < 2 ||
      !Number.isFinite(firstMs) ||
      firstMs - requestedFromDate.getTime() > INCOMPLETE_SLACK_MS;

    return {
      symbol,
      yahooSymbol,
      interval: INTERVAL,
      requestedFrom,
      availableFrom,
      availableTo,
      incomplete,
      points,
    };
  } catch (err) {
    // Yahoo has no (or too little) history for some tickers — return the empty
    // series so the panel can render a "not enough data" state instead of 500ing.
    console.warn(
      `[price-history] Yahoo chart() failed for ${symbol} (${yahooSymbol}):`,
      err instanceof Error ? err.message : err,
    );
    return emptyPayload(symbol, yahooSymbol, requestedFrom);
  }
}

async function historyFor(symbol: string): Promise<History5yPayload> {
  const now = Date.now();
  const hit = cache.get(symbol);
  if (hit && hit.expiresAt > now) return hit.payload;

  const pending = inflight.get(symbol);
  if (pending) return pending;

  const promise = fetchHistory(symbol)
    .then((payload) => {
      cache.set(symbol, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
      return payload;
    })
    .finally(() => {
      inflight.delete(symbol);
    });
  inflight.set(symbol, promise);
  return promise;
}

export async function priceHistoryRoutes(app: FastifyInstance) {
  app.get("/:symbol", async (req, reply) => {
    const symbol = String((req.params as { symbol?: string })?.symbol ?? "")
      .trim()
      .toUpperCase();
    if (!symbol) return reply.status(400).send({ error: "missing_symbol", points: [] });

    try {
      const data = await historyFor(symbol);
      return reply.send(data);
    } catch (err) {
      app.log.warn({ err, symbol }, "[price-history] 5y fetch failed");
      return reply.send(emptyPayload(symbol, YAHOO_TICKERS[symbol] ?? null, fiveYearsAgo().toISOString()));
    }
  });
}
