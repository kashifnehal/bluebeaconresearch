import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { Text } from "react-native";
import { geoFetch } from "@/lib/api";
import { REGIONS } from "@blue-beacon-research/shared";

type AlertRule = {
  id: string;
  name: string;
  min_severity: number;
  regions: string[] | null;
  commodities: string[] | null;
  frequency: string;
  channels: string[] | null;
  is_active: boolean;
};

export default function AlertsTab() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Blue Beacon Research alerts");
  const [minSeverity, setMinSeverity] = useState(8);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

  const regionIds = useMemo(() => REGIONS.map((r) => r.id), []);

  async function load() {
    try {
      const res = await geoFetch<{ data: AlertRule[] }>("/v1/alerts/rules");
      setRules(res.data ?? []);
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createRule() {
    try {
      const payload = {
        name,
        regions: selectedRegions,
        commodities: [],
        minSeverity,
        channels: ["telegram"],
        frequency: "immediate",
        isActive: true,
      };

      await geoFetch("/v1/alerts/rules", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreating(false);
      setSelectedRegions([]);
      setName("Blue Beacon Research alerts");
      setMinSeverity(8);
      await load();
    } catch {
      // ignore for now
    }
  }

  async function toggleRule(rule: AlertRule, next: boolean) {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: next } : r)));
    try {
      await geoFetch(`/v1/alerts/rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: next }),
      });
    } catch {
      // revert on failure
      setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: rule.is_active } : r)));
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#050914" }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: "#F8FAFC", fontSize: 20, fontWeight: "800", marginBottom: 12 }}>Alert rules</Text>

      {loading ? (
        <Text style={{ color: "rgba(148,163,184,1)" }}>Loading...</Text>
      ) : rules.length ? (
        rules.map((r) => (
          <View
            key={r.id}
            style={{
              borderWidth: 1,
              borderColor: "rgba(45,55,72,1)",
              backgroundColor: "#161B22",
              padding: 14,
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#F8FAFC", fontSize: 14, fontWeight: "800" }} numberOfLines={2}>
                  {r.name}
                </Text>
                <Text style={{ color: "rgba(148,163,184,1)", marginTop: 4, fontSize: 12 }}>
                  Severity ≥ {r.min_severity} • {r.frequency}
                </Text>
              </View>
              <Switch
                value={Boolean(r.is_active)}
                onValueChange={(v) => toggleRule(r, v)}
                thumbColor={r.is_active ? "#3B82F6" : "#64748B"}
              />
            </View>
            <Text style={{ color: "rgba(148,163,184,1)", marginTop: 8, fontSize: 12 }}>
              Channels: {(r.channels ?? ["email"]).join(", ")}
            </Text>
          </View>
        ))
      ) : (
        <View style={{ paddingTop: 24 }}>
          <Text style={{ color: "#F8FAFC", fontSize: 16, fontWeight: "800" }}>No alert rules yet.</Text>
          <Text style={{ color: "rgba(148,163,184,1)", marginTop: 6 }}>
            Create rules in the web app onboarding or Alerts Center.
          </Text>
        </View>
      )}

      <Pressable
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#3B82F6",
          justifyContent: "center",
          alignItems: "center",
          opacity: 0.8,
        }}
        onPress={() => {
          setCreating((v) => !v);
        }}
      >
        <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }}>+</Text>
      </Pressable>

      {creating ? (
        <View
          style={{
            marginTop: 18,
            borderWidth: 1,
            borderColor: "rgba(45,55,72,1)",
            backgroundColor: "#0D1117",
            padding: 14,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#F8FAFC", fontWeight: "900", marginBottom: 8 }}>New rule</Text>
          <Text style={{ color: "#94A3B8", fontWeight: "800", marginBottom: 6 }}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={{
              borderWidth: 1,
              borderColor: "rgba(45,55,72,1)",
              borderRadius: 10,
              paddingVertical: 10,
              paddingHorizontal: 12,
              color: "#F8FAFC",
              marginBottom: 12,
            }}
            placeholder="e.g. Middle East oil alerts"
            placeholderTextColor="rgba(148,163,184,1)"
          />

          <Text style={{ color: "#94A3B8", fontWeight: "800", marginBottom: 6 }}>Minimum severity</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {[7, 8, 9, 10].map((v) => {
              const active = minSeverity === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => setMinSeverity(v)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? "#3B82F6" : "rgba(22,27,34,1)",
                    borderWidth: 1,
                    borderColor: active ? "#3B82F6" : "rgba(45,55,72,1)",
                  }}
                >
                  <Text style={{ color: active ? "#fff" : "#94A3B8", fontWeight: "900" }}>{v}+</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={{ color: "#94A3B8", fontWeight: "800", marginBottom: 6 }}>Regions</Text>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {regionIds.slice(0, 4).map((r) => {
              const active = selectedRegions.includes(r);
              return (
                <Pressable
                  key={r}
                  onPress={() =>
                    setSelectedRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
                  }
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? "#3B82F6" : "rgba(22,27,34,1)",
                    borderWidth: 1,
                    borderColor: active ? "#3B82F6" : "rgba(45,55,72,1)",
                  }}
                >
                  <Text style={{ color: active ? "#fff" : "#94A3B8", fontWeight: "900" }}>{r}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => setCreating(false)}
              style={{
                flex: 1,
                backgroundColor: "rgba(22,27,34,1)",
                borderWidth: 1,
                borderColor: "rgba(45,55,72,1)",
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#F8FAFC", fontWeight: "900" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={createRule}
              style={{
                flex: 1,
                backgroundColor: "#3B82F6",
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900" }}>Create</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

