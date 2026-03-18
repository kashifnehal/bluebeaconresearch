import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "react-native";

import { geoFetch } from "@/lib/api";

type BacktestResult = {
  totalEvents: number;
  accuracyPct: number;
  avgMovePct: number;
  maxMovePct: number;
  minMovePct: number;
  rows: Array<{
    date: string;
    country: string;
    summary: string;
    movePct: number;
    correct: boolean;
  }>;
};

type Horizon = "4hr" | "24hr" | "48hr" | "7d";

export default function BacktestingTab() {
  const [eventType, setEventType] = useState("Missile/drone strike");
  const [region, setRegion] = useState("middle-east");
  const [commodity, setCommodity] = useState("USOIL");
  const [horizon, setHorizon] = useState<Horizon>("24hr");

  const [from] = useState("2015-01-01");
  const [to] = useState(new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await geoFetch<BacktestResult>("/v1/backtesting", {
        method: "POST",
        body: JSON.stringify({ eventType, region, commodity, horizon, from, to }),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#050914" }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: "#F8FAFC", fontSize: 20, fontWeight: "900", marginBottom: 12 }}>
        Backtesting Lab
      </Text>

      <View style={{ borderWidth: 1, borderColor: "rgba(45,55,72,1)", backgroundColor: "#0D1117", padding: 14, borderRadius: 12 }}>
        <Text style={{ color: "#94A3B8", fontWeight: "800", marginBottom: 8 }}>Run a quick backtest</Text>

        <Text style={{ color: "#94A3B8", marginTop: 8 }}>Event Type</Text>
        <Text style={{ color: "#F8FAFC", fontWeight: "900", marginTop: 4 }}>{eventType}</Text>

        <Text style={{ color: "#94A3B8", marginTop: 10 }}>Region</Text>
        <Text style={{ color: "#F8FAFC", fontWeight: "900", marginTop: 4 }}>{region}</Text>

        <Text style={{ color: "#94A3B8", marginTop: 10 }}>Commodity</Text>
        <Text style={{ color: "#F8FAFC", fontWeight: "900", marginTop: 4 }}>{commodity}</Text>

        <Text style={{ color: "#94A3B8", marginTop: 10 }}>Horizon</Text>
        <Text style={{ color: "#F8FAFC", fontWeight: "900", marginTop: 4 }}>{horizon}</Text>

        <Pressable
          onPress={run}
          disabled={loading}
          style={{
            marginTop: 14,
            backgroundColor: "#3B82F6",
            borderRadius: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            opacity: loading ? 0.7 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>{loading ? "Running..." : "Run backtest"}</Text>
        </Pressable>

        {error ? (
          <Text style={{ color: "#EF4444", marginTop: 10, fontWeight: "800" }}>{error}</Text>
        ) : null}
      </View>

      {result ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: "#F8FAFC", fontWeight: "900", fontSize: 16, marginBottom: 8 }}>
            Results
          </Text>
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            <View style={{ padding: 10, borderWidth: 1, borderColor: "rgba(45,55,72,1)", backgroundColor: "#161B22", borderRadius: 12 }}>
              <Text style={{ color: "#94A3B8", fontWeight: "800", fontSize: 12 }}>Events</Text>
              <Text style={{ color: "#F8FAFC", fontWeight: "900", fontSize: 18 }}>{result.totalEvents}</Text>
            </View>
            <View style={{ padding: 10, borderWidth: 1, borderColor: "rgba(45,55,72,1)", backgroundColor: "#161B22", borderRadius: 12 }}>
              <Text style={{ color: "#94A3B8", fontWeight: "800", fontSize: 12 }}>Accuracy</Text>
              <Text style={{ color: "#F8FAFC", fontWeight: "900", fontSize: 18 }}>{result.accuracyPct}%</Text>
            </View>
            <View style={{ padding: 10, borderWidth: 1, borderColor: "rgba(45,55,72,1)", backgroundColor: "#161B22", borderRadius: 12 }}>
              <Text style={{ color: "#94A3B8", fontWeight: "800", fontSize: 12 }}>Avg move</Text>
              <Text style={{ color: "#F8FAFC", fontWeight: "900", fontSize: 18 }}>{result.avgMovePct}%</Text>
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            <Text style={{ color: "#94A3B8", fontWeight: "900", marginBottom: 8 }}>Top events</Text>
            {result.rows.slice(0, 12).map((r, idx) => (
              <View
                key={`${r.date}-${idx}`}
                style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(45,55,72,1)" }}
              >
                <Text style={{ color: "#F8FAFC", fontWeight: "900" }}>
                  {r.country} • {r.date}
                </Text>
                <Text style={{ color: "#94A3B8", marginTop: 4 }} numberOfLines={2}>
                  {r.summary}
                </Text>
                <Text style={{ color: r.movePct >= 0 ? "#34D399" : "#F87171", fontWeight: "900", marginTop: 6 }}>
                  {r.movePct >= 0 ? "+" : ""}
                  {r.movePct.toFixed(2)}% • {r.correct ? "Correct" : "Wrong"}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

