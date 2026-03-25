import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "react-native";
import { useRouter } from "expo-router";

import type { CommodityPrice } from "@blue-beacon-research/shared";

import { getSupabaseClient } from "@/lib/supabase";
import { geoFetch } from "@/lib/api";

type WatchRow = { symbol: string; alert_enabled: boolean | null };

export default function WatchlistTab() {
  const router = useRouter();
  const [symbols, setSymbols] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, CommodityPrice>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) return;

        const { data: watchRows } = await supabase
          .from("watchlist_entries")
          .select("symbol,alert_enabled")
          .order("created_at", { ascending: false });

        const list = (watchRows ?? []).map((r: WatchRow) => r.symbol);
        if (!cancelled) setSymbols(list);

        // Pull latest prices for the watched symbols (best-effort).
        const priceMap: Record<string, CommodityPrice> = {};
        for (const sym of list) {
          try {
            const res = await geoFetch<{ data: any }>(`/v1/prices/${encodeURIComponent(sym)}`);
            const row = res.data;
            priceMap[sym] = {
              symbol: row.symbol,
              price: Number(row.price),
              change24h: Number(row.change_24h ?? row.change24h ?? 0),
              changePct24h: Number(row.change_pct_24h ?? row.changePct24h ?? 0),
              high24h: Number(row.high_24h ?? row.high24h ?? 0),
              low24h: Number(row.low_24h ?? row.low24h ?? 0),
              fetchedAt: row.fetched_at ?? row.fetchedAt ?? new Date().toISOString(),
            };
          } catch {
            // ignore per-symbol failures
          }
        }
        if (!cancelled) setPrices(priceMap);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const entries = useMemo(
    () =>
      symbols.map((sym) => ({
        symbol: sym,
        price: prices[sym]?.price ?? null,
        changePct24h: prices[sym]?.changePct24h ?? null,
      })),
    [symbols, prices],
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#050914" }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: "#F8FAFC", fontSize: 20, fontWeight: "800", marginBottom: 12 }}>Commodity Watchlist</Text>

      {loading ? (
        <Text style={{ color: "rgba(148,163,184,1)" }}>Loading...</Text>
      ) : entries.length ? (
        entries.map((e) => (
          <Pressable
            key={e.symbol}
            onPress={() => router.push(`/event/${encodeURIComponent(e.symbol)}` as any)}
            style={{
              borderWidth: 1,
              borderColor: "rgba(45,55,72,1)",
              backgroundColor: "#0D1117",
              padding: 14,
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "700" }}>{e.symbol}</Text>
            <Text style={{ color: "#F8FAFC", fontSize: 24, fontWeight: "900" }}>
              {e.price !== null ? e.price.toFixed(2) : "--"}
            </Text>
            <Text style={{ color: "rgba(148,163,184,1)" }}>
              24h:{" "}
              {e.changePct24h !== null
                ? `${e.changePct24h >= 0 ? "+" : ""}${e.changePct24h.toFixed(2)}%`
                : "--"}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={{ color: "rgba(148,163,184,1)" }}>No watchlist items yet.</Text>
      )}
    </ScrollView>
  );
}

