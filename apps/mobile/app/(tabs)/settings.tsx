import { ScrollView, View } from "react-native";
import { Text } from "react-native";
import { getSupabaseClient } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function SettingsTab() {
  const [plan, setPlan] = useState<string>("free");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        if (!data.session?.user?.id) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_tier")
          .eq("id", data.session.user.id)
          .maybeSingle();
        if (!cancelled && (profile as any)?.plan_tier) setPlan(String((profile as any).plan_tier));
      } catch {
        // ignore
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#050914" }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: "#F8FAFC", fontSize: 20, fontWeight: "900", marginBottom: 12 }}>Settings</Text>
      <View style={{ borderWidth: 1, borderColor: "rgba(45,55,72,1)", backgroundColor: "#161B22", padding: 14, borderRadius: 12 }}>
        <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "700" }}>Subscription plan</Text>
        <Text style={{ color: "#F8FAFC", fontSize: 20, fontWeight: "900", marginTop: 6 }}>{plan}</Text>
      </View>

      <View style={{ marginTop: 12, borderWidth: 1, borderColor: "rgba(45,55,72,1)", backgroundColor: "#161B22", padding: 14, borderRadius: 12 }}>
        <Text style={{ color: "#94A3B8", fontSize: 12, fontWeight: "700" }}>Appearance</Text>
        <Text style={{ color: "rgba(148,163,184,1)", marginTop: 6, fontSize: 14 }}>
          Theme + compact mode are handled on web for now.
        </Text>
      </View>
    </ScrollView>
  );
}

