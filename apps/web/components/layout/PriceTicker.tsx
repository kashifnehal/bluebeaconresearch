"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

type Price = {
  symbol: string;
  price: number;
  change_pct_24h?: number;
  changePct24h?: number;
};

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
      <div className="h-10 bg-surface-secondary border-b border-border flex items-center px-4 gap-4 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-5 w-24 bg-surface-elevated" />
        ))}
      </div>
    );
  }

  const prices = data?.prices ?? [];

  return (
    <div className="h-10 bg-surface-secondary border-b border-border overflow-hidden">
      <div
        className="flex items-center gap-6 px-4 h-full whitespace-nowrap"
        style={{
          animation: "ticker 30s linear infinite",
        }}
      >
        {prices.map((p) => {
          const pct = p.change_pct_24h ?? p.changePct24h ?? 0;
          const isUp = pct >= 0;
          return (
            <button
              key={p.symbol}
              onClick={() => router.push(`/watchlist?symbol=${encodeURIComponent(p.symbol)}`)}
              className="flex items-center gap-2"
            >
              <span className="font-mono text-xs text-text-muted">{p.symbol}</span>
              <span className="font-mono text-sm text-text-primary font-medium">
                {Number(p.price).toFixed(2)}
              </span>
              <span className={`text-xs ${isUp ? "text-price-up" : "text-price-down"}`}>
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(2)}%
              </span>
              <span className="mx-2 inline-block h-4 w-px bg-border" />
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

