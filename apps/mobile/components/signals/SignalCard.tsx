import type { Signal } from "@blue-beacon-research/shared";
import { Pressable, View } from "react-native";
import { Text } from "react-native";

export function SignalCard({
  signal,
  variant = "feed",
  onPress,
}: {
  signal: Signal;
  variant?: "feed" | "compact";
  onPress?: () => void;
}) {
  const severity = signal.severity;
  const severityText =
    severity >= 9 ? "9-10" : severity >= 8 ? "8" : severity >= 7 ? "7" : "low";

  const severityColor =
    severity >= 9 ? "#EF4444" : severity >= 8 ? "#F59E0B" : severity >= 7 ? "#F59E0B" : "#94A3B8";

  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: "rgba(45,55,72,1)",
        backgroundColor: "#0D1117",
        padding: variant === "compact" ? 12 : 16,
        borderRadius: 12,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              height: 24,
              paddingHorizontal: 10,
              borderRadius: 8,
              backgroundColor: "rgba(22,27,34,1)",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: severityColor, fontSize: 12, fontWeight: "700" }}>{severityText}</Text>
          </View>
          <Text style={{ color: "rgba(148,163,184,1)", fontSize: 11, fontWeight: "600", textTransform: "uppercase" }}>
            {signal.eventType}
          </Text>
        </View>
        <Text style={{ color: "rgba(148,163,184,1)", fontSize: 12 }}>
          {new Date(signal.createdAt).toLocaleTimeString()}
        </Text>
      </View>

      <Text
        style={{
          marginTop: 10,
          fontSize: 16,
          fontWeight: "700",
          color: "#F8FAFC",
        }}
        numberOfLines={2}
      >
        {signal.title}
      </Text>
      <Text style={{ marginTop: 6, color: "rgba(148,163,184,1)", fontSize: 13 }} numberOfLines={2}>
        {signal.summary}
      </Text>

      <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: "rgba(148,163,184,1)", fontSize: 12 }} numberOfLines={1}>
          {signal.country}
        </Text>
      </View>

      <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {signal.commodityImpacts.slice(0, variant === "compact" ? 2 : 4).map((c, idx) => (
          <View
            key={`${signal.id}-${idx}-${c.asset}`}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 9999,
              backgroundColor:
                c.direction === "up"
                  ? "rgba(16,185,129,0.15)"
                  : c.direction === "down"
                    ? "rgba(239,68,68,0.15)"
                    : c.direction === "volatile"
                      ? "rgba(245,158,11,0.15)"
                      : "rgba(22,27,34,1)",
              borderWidth: 1,
              borderColor: "rgba(45,55,72,1)",
            }}
          >
            <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700" }}>
              {c.asset}
            </Text>
          </View>
        ))}
      </View>

      {/* Bookmark icon kept as UI affordance; persistence is handled by future Phase 9 steps */}
      <Text style={{ position: "absolute", right: 14, bottom: 10, color: "rgba(148,163,184,1)", fontSize: 18 }}>
        ☆
      </Text>
    </Pressable>
  );
}

