"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMODITIES } from "@geosignal/shared";

type Price = {
  symbol: string;
  price: number;
  change_pct_24h?: number;
  changePct24h?: number;
};

export function WatchlistClient() {
  const params = useSearchParams();
  const preselect = params.get("symbol");
  const [watch, setWatch] = useState<string[]>(() =>
    preselect ? [preselect] : ["USOIL", "XAUUSD"],
  );
  const [addSymbol, setAddSymbol] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["prices"],
    queryFn: async () => {
      const res = await fetch("/api/prices");
      return (await res.json()) as { prices: Price[] };
    },
    refetchInterval: 60_000,
  });

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, Price>();
    for (const p of data?.prices ?? []) map.set(p.symbol, p);
    return map;
  }, [data?.prices]);

  const available = COMMODITIES.filter((c) => !watch.includes(c.symbol));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-text-primary text-2xl font-semibold">
          Commodity Watchlist
        </h1>
        <div className="flex items-center gap-2">
          <Select value={addSymbol} onValueChange={(v) => setAddSymbol(v)}>
            <SelectTrigger className="h-10 w-[220px] bg-surface border-border">
              <SelectValue placeholder="Add commodity" />
            </SelectTrigger>
            <SelectContent>
              {available.map((c) => (
                <SelectItem key={c.symbol} value={c.symbol}>
                  {c.label} ({c.symbol})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="h-10 bg-accent hover:bg-accent-hover text-white"
            onClick={() => {
              if (!addSymbol) return;
              setWatch((p) => [...p, addSymbol]);
              setAddSymbol(null);
            }}
          >
            <Plus size={16} /> Add
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {watch.map((sym) => {
          const meta = COMMODITIES.find((c) => c.symbol === sym);
          const p = priceBySymbol.get(sym);
          const pct = p ? (p.change_pct_24h ?? p.changePct24h ?? 0) : 0;
          const isUp = pct >= 0;
          return (
            <Card
              key={sym}
              className="bg-surface border border-border rounded-xl overflow-hidden shadow-none"
            >
              <div className="bg-surface-secondary p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-text-primary font-semibold text-lg">
                      {meta?.label ?? sym}
                    </div>
                    <Badge className="mt-1 bg-surface-elevated text-text-muted">
                      {meta?.category ?? "—"}
                    </Badge>
                  </div>
                  <button
                    onClick={() => setWatch((w) => w.filter((x) => x !== sym))}
                    className="text-text-muted hover:text-danger"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="mt-3 flex items-end justify-between">
                  <div className="font-mono text-2xl font-semibold text-text-primary">
                    {p ? Number(p.price).toFixed(2) : "—"}
                  </div>
                  <div
                    className={`text-sm font-medium ${isUp ? "text-price-up" : "text-price-down"}`}
                  >
                    {pct >= 0 ? "+" : ""}
                    {pct.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div className="p-4">
                <div className="text-text-muted text-xs">
                  Mini chart placeholder (Phase 4)
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

