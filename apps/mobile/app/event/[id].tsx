import { useEffect, useState } from "react";
import { ScrollView, Pressable, View } from "react-native";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import type { Signal } from "@blue-beacon-research/shared";

import { geoFetch } from "@/lib/api";

function mapRowToSignal(row: any): Signal {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    summary: String(row.summary ?? ""),
    aiAnalysis: row.ai_analysis ?? undefined,
    severity: Number(row.severity ?? 0),
    confidence: Number(row.confidence ?? 0),
    eventType: String(row.event_type ?? row.eventType ?? ""),
    country: String(row.country ?? ""),
    region: (row.region ?? "global") as Signal["region"],
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    sourcesCount: row.sources_count ?? row.sourcesCount ?? 1,
    commodityImpacts: (row.commodity_impacts ?? row.commodityImpacts ?? []) as Signal["commodityImpacts"],
    sanctionsMatches: row.sanctions_matches ?? row.sanctionsMatches ?? undefined,
    isBreaking: Boolean(row.is_breaking ?? row.isBreaking ?? false),
    isActive: Boolean(row.is_active ?? row.isActive ?? true),
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
  };
}

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!id) return;
        setLoading(true);
        setErr(null);
        const res = await geoFetch<{ data: any }>(`/v1/events/${encodeURIComponent(String(id))}`);
        if (cancelled) return;
        setSignal(mapRowToSignal(res.data));
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Failed to load event");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#050914" }} contentContainerStyle={{ padding: 16 }}>
      <Pressable onPress={() => router.back()} style={{ marginBottom: 12 }}>
        <Text style={{ color: "#94A3B8", fontWeight: "800" }}>{`← Back`}</Text>
      </Pressable>

      {loading ? (
        <Text style={{ color: "#94A3B8", fontWeight: "700" }}>Loading...</Text>
      ) : err ? (
        <View>
          <Text style={{ color: "#EF4444", fontWeight: "800" }}>Failed to load event</Text>
          <Text style={{ color: "#94A3B8", marginTop: 6 }}>{err}</Text>
        </View>
      ) : signal ? (
        <View style={{ borderWidth: 1, borderColor: "rgba(45,55,72,1)", backgroundColor: "#0D1117", padding: 14, borderRadius: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <View style={{ backgroundColor: signal.severity >= 9 ? "#EF4444" : "#F59E0B", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ color: "#fff", fontWeight: "900" }}>{signal.severity}</Text>
              </View>
              <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "800" }}>{signal.eventType}</Text>
            </View>
            <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "800" }}>
              {new Date(signal.createdAt).toLocaleString()}
            </Text>
          </View>

          <Text style={{ color: "#F8FAFC", fontSize: 22, fontWeight: "900", marginBottom: 8 }}>{signal.title}</Text>
          <Text style={{ color: "#94A3B8", fontSize: 14, lineHeight: 20 }}>{signal.summary}</Text>

          <View style={{ marginTop: 14 }}>
            <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "900", marginBottom: 8 }}>Affected assets</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {signal.commodityImpacts.map((c, idx) => (
                <View
                  key={`${signal.id}-${idx}-${c.asset}`}
                  style={{
                    backgroundColor:
                      c.direction === "up"
                        ? "rgba(16,185,129,0.15)"
                        : c.direction === "down"
                          ? "rgba(239,68,68,0.15)"
                          : c.direction === "volatile"
                            ? "rgba(245,158,11,0.15)"
                            : "rgba(22,27,34,1)",
                    borderColor: "rgba(45,55,72,1)",
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                  }}
                >
                  <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "900" }}>{c.asset}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <Text style={{ color: "#94A3B8" }}>Event not found.</Text>
      )}
    </ScrollView>
  );
}

