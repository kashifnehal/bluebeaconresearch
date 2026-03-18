import { useMemo, useState } from "react";
import { ScrollView, Pressable, View } from "react-native";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { Signal } from "@geosignal/shared";

import { geoFetch } from "@/lib/api";
import { SignalCard } from "@/components/signals/SignalCard";

type Region =
  | "all"
  | "middle-east"
  | "eastern-europe"
  | "africa";

type Filter = "all" | "middle-east" | "eastern-europe" | "africa" | "7+" | "8+";

function pillToParams(pill: Filter): { region?: Region; severity?: number } {
  if (pill === "7+") return { severity: 7 };
  if (pill === "8+") return { severity: 8 };
  if (pill === "all") return {};
  return { region: pill as Region };
}

export default function FeedTab() {
  const router = useRouter();
  const [pill, setPill] = useState<Filter>("all");

  const params = useMemo(() => pillToParams(pill), [pill]);

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["signals", pill],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("sort", "newest");
      qs.set("limit", "25");
      if (params.region && params.region !== "all") qs.set("region", params.region);
      if (params.severity) qs.set("severity", String(params.severity));
      const res = await geoFetch<{ data: Signal[] }>(`/v1/signals?${qs.toString()}`);
      return res.data;
    },
    enabled: true,
    refetchInterval: 30_000,
  });

  const signals = data ?? [];
  const breaking = signals.find((s) => s.severity >= 9);

  return (
    <View style={{ flex: 1, backgroundColor: "#050914" }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        refreshControl={undefined}
      >
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          {(
            [
              { label: "All", value: "all" as const },
              { label: "Middle East", value: "middle-east" as const },
              { label: "Europe", value: "eastern-europe" as const },
              { label: "Africa", value: "africa" as const },
              { label: "7+", value: "7+" as const },
              { label: "8+", value: "8+" as const },
            ] as const
          ).map((p) => {
            const active = p.value === pill;
            return (
              <Pressable
                key={p.value}
                onPress={() => setPill(p.value)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 9999,
                  backgroundColor: active ? "#3B82F6" : "rgba(22,27,34,1)",
                  borderWidth: 1,
                  borderColor: active ? "#3B82F6" : "rgba(45,55,72,1)",
                }}
              >
                <Text style={{ color: active ? "#fff" : "#94A3B8", fontWeight: "700", fontSize: 12 }}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {breaking ? (
          <Pressable
            onPress={() => router.push(`/event/${breaking.id}` as any)}
            style={{
              backgroundColor: "#EF4444",
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>BREAKING</Text>
            <Text style={{ color: "#fff", fontWeight: "700", marginTop: 4 }} numberOfLines={2}>
              {breaking.title}
            </Text>
          </Pressable>
        ) : null}

        {isLoading ? (
          <Text style={{ color: "#94A3B8" }}>Loading signals...</Text>
        ) : error ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: "#EF4444", fontWeight: "700" }}>Could not load signals</Text>
            <Text style={{ color: "#94A3B8" }}>
              If you haven&apos;t authenticated, the API may be rejecting requests.
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={{
                marginTop: 8,
                backgroundColor: "#3B82F6",
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 14,
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {signals.length ? (
          signals.map((s) => (
            <SignalCard key={s.id} signal={s} onPress={() => router.push(`/event/${s.id}` as any)} />
          ))
        ) : (
          <View style={{ paddingTop: 24, alignItems: "center" }}>
            <Text style={{ color: "#94A3B8", fontWeight: "700" }}>No signals match your filters</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
