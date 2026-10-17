"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJsonWithTimeout } from "@/lib/fetch-with-timeout";
import {
  LEDGER_CONCURRENCY,
  LEDGER_STALE_MS,
  buildLedgerRows,
  runWithConcurrency,
  type LedgerPulse,
  type LedgerRow,
} from "@/lib/desk-ledger";

type PriceRow = { symbol: string; price?: number; change_pct_24h?: number; changePct24h?: number };
type PulseBody = { last24h?: number; prior24h?: number; error?: string };

async function fetchPulse(symbol: string): Promise<LedgerPulse> {
  try {
    const res = await fetch(`/api/signals/pulse?symbol=${encodeURIComponent(symbol)}`);
    const body = (await res.json()) as PulseBody;
    if (!res.ok || body.error) return null;
    if (typeof body.last24h !== "number" || typeof body.prior24h !== "number") return null;
    return { last24h: body.last24h, prior24h: body.prior24h };
  } catch {
    return null;
  }
}

/**
 * Prices come from /api/prices (same query key as the dashboard's own prices
 * query, so it is one request). Pulse counts are fetched for the watchlist
 * symbols only, four at a time, and cached for 60 seconds.
 */
export function useMarketsLedger(symbols: string[], enabled: boolean) {
  const prices = useQuery({
    queryKey: ["prices"],
    queryFn: () => fetchJsonWithTimeout<{ prices: PriceRow[] }>("/api/prices"),
    refetchInterval: 60_000,
  });

  const pulses = useQuery({
    queryKey: ["ledger-pulse", symbols.join(",")],
    enabled: enabled && symbols.length > 0,
    staleTime: LEDGER_STALE_MS,
    retry: false,
    queryFn: async () => {
      const results = await runWithConcurrency(symbols, LEDGER_CONCURRENCY, fetchPulse);
      const out: Record<string, LedgerPulse> = {};
      symbols.forEach((s, i) => {
        out[s] = results[i];
      });
      return out;
    },
  });

  const rows: LedgerRow[] = buildLedgerRows(symbols, prices.data?.prices ?? [], pulses.data ?? {});
  return {
    rows,
    pricesUpdatedAt: prices.dataUpdatedAt,
    pricesLoading: prices.isLoading,
    pricesError: prices.isError,
    pulseLoading: pulses.isLoading,
  };
}
