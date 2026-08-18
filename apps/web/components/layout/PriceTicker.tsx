"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

type Price = {
  symbol: string;
  price: number;
  change_pct_24h?: number;
  changePct24h?: number;
  fetched_at?: string;
};

// Price syncer runs every 15 min (price-syncer.ts) — two missed cycles is a
// reasonable "something's actually wrong" threshold, not just normal cron jitter.
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

function isStale(fetchedAt?: string): boolean {
  if (!fetchedAt) return false;
  const ts = new Date(fetchedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts > STALE_THRESHOLD_MS;
}

export function PriceTicker() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["prices"],
    queryFn: async () => {
      const res = await fetch("/api/prices");
      return (await res.json()) as { prices: Price[] };
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="h-10 bg-surface-container-low border-b border-outline-variant flex items-center px-4 gap-4 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-5 w-24 bg-surface-container-high" />
        ))}
      </div>
    );
  }

  const prices = data?.prices ?? [];

  return (
    <div className="h-10 bg-surface-container-low border-b border-outline-variant overflow-hidden">
      <div
        className="flex items-center gap-6 px-4 h-full whitespace-nowrap"
        style={{
          animation: "ticker 30s linear infinite",
        }}
      >
        {prices.map((p) => {
          const pct = p.change_pct_24h ?? p.changePct24h ?? 0;
          const isUp = pct >= 0;
          const stale = isStale(p.fetched_at);
          return (
            <button
              key={p.symbol}
              onClick={() => router.push(`/watchlist?symbol=${encodeURIComponent(p.symbol)}`)}
              className="flex items-center gap-2"
              title={stale && p.fetched_at ? `Price last updated ${new Date(p.fetched_at).toLocaleString()} — stale` : undefined}
            >
              {stale && <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-label="Price data is stale" />}
              <span className="font-mono text-xs text-outline">{p.symbol}</span>
              <span className={`font-mono text-sm font-medium ${stale ? "text-warning" : "text-on-surface"}`}>
                {Number(p.price).toFixed(2)}
              </span>
              <span className={`text-xs ${isUp ? "text-price-up" : "text-price-down"}`}>
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(2)}%
              </span>
              <span className="mx-2 inline-block h-4 w-px bg-outline-variant" />
            </button>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}

