"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Signal } from "@blue-beacon-research/shared";
import { safeFormatDistanceToNow, generateAlertRuleName } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { IngestionStatusBanner } from "@/components/IngestionStatusBanner";
import { Pagination } from "@/components/ui/Pagination";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { logFunnelEventOnce } from "@/lib/funnel-events";

type AlertRule = {
  id: string;
  name: string;
  regions: string[];
  commodities: string[];
  min_severity: number;
  channels: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  created_at: string;
};

type DeliveryStatus = "queued" | "delivered" | "failed";

// Matched-signals shown per rule at once. 5 matches the list's prior fixed
// `.slice(0, 5)`, so page 1 of each rule renders exactly as it did before.
const MATCHES_PER_PAGE = 5;

type MatchedSignal = {
  id: string;
  title: string;
  severity: number;
  eventDate?: string | null;
  matchedAt: string;
  deliveries: { channel: string | null; status: DeliveryStatus }[];
};

type AlertSentRow = {
  id: string;
  rule_id: string | null;
  signal_id: string;
  channel: string | null;
  status: DeliveryStatus;
  created_at: string;
  signals?: {
    id: string;
    title: string;
    severity: number;
    event_date?: string | null;
  } | null;
};

function worstDeliveryStatus(deliveries: { status: DeliveryStatus }[]): DeliveryStatus {
  if (deliveries.some((d) => d.status === "failed")) return "failed";
  if (deliveries.some((d) => d.status === "queued")) return "queued";
  return "delivered";
}

export default function AlertsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [modalRegion, setModalRegion] = useState("middle-east");
  const [modalMinSeverity, setModalMinSeverity] = useState(7);
  const [modalChannels, setModalChannels] = useState<string[]>(["telegram"]);
  const [modalEventType, setModalEventType] = useState<string | undefined>(undefined);
  // Per-rule page index for the "Recent Matches" list (client-side — paginates
  // the already-fetched, already-grouped matches for that rule).
  const [matchPageByRule, setMatchPageByRule] = useState<Record<string, number>>({});

  const { data: rulesData, isLoading: rulesLoading, isError: rulesError } = useQuery({
    queryKey: ["alert-rules"],
    queryFn: async () => {
      const res = await fetch("/api/alert-rules");
      if (!res.ok) throw new Error("Failed to fetch alert rules");
      return (await res.json()) as { rules: AlertRule[] };
    },
    refetchInterval: 30_000,
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ["alerts", "recent", "for-rules"],
    queryFn: async () => {
      const res = await fetch("/api/alerts/recent?limit=100");
      if (!res.ok) throw new Error("Failed to fetch recent alerts");
      return (await res.json()) as { alerts: AlertSentRow[] };
    },
    refetchInterval: 30_000,
  });

  const rules = rulesData?.rules ?? [];
  const isLoading = rulesLoading || alertsLoading;

  // Real alerts_sent rows only, grouped per rule then per signal (a signal can have
  // one alerts_sent row per delivery channel) — this is what "matched" a rule actually
  // means: a dispatch attempt the backend already made, per the matching logic in
  // apps/backend/src/workers/alert-dispatcher.ts lines 48-57. Nothing here re-derives
  // or guesses matches client-side.
  const matchesByRule = useMemo(() => {
    const alertRows = alertsData?.alerts ?? [];
    const perRule = new Map<string, Map<string, MatchedSignal>>();
    for (const row of alertRows) {
      if (!row.rule_id || !row.signals) continue;
      let bySignal = perRule.get(row.rule_id);
      if (!bySignal) {
        bySignal = new Map();
        perRule.set(row.rule_id, bySignal);
      }
      const existing = bySignal.get(row.signal_id);
      if (existing) {
        existing.deliveries.push({ channel: row.channel, status: row.status });
        if (row.created_at > existing.matchedAt) existing.matchedAt = row.created_at;
      } else {
        bySignal.set(row.signal_id, {
          id: row.signals.id,
          title: row.signals.title,
          severity: row.signals.severity,
          eventDate: row.signals.event_date,
          matchedAt: row.created_at,
          deliveries: [{ channel: row.channel, status: row.status }],
        });
      }
    }
    const result = new Map<string, MatchedSignal[]>();
    for (const [ruleId, bySignal] of perRule) {
      result.set(
        ruleId,
        Array.from(bySignal.values()).sort((a, b) => (a.matchedAt < b.matchedAt ? 1 : -1)),
      );
    }
    return result;
  }, [alertsData]);

  const openSetAlertModal = (signal?: Signal) => {
    if (signal) {
      setModalRegion(signal.region || "middle-east");
      setModalMinSeverity(Math.max(1, signal.severity - 1));
      setModalEventType(signal.eventType);
    } else {
      setModalRegion("middle-east");
      setModalMinSeverity(7);
      setModalEventType(undefined);
    }
    setModalChannels(["telegram"]);
    setAlertModalOpen(true);
  };

  const createAlertRule = useMutation({
    mutationFn: async () => {
      if (modalMinSeverity < 1 || modalMinSeverity > 10) {
        throw new Error("Severity must be between 1 and 10");
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase client not available");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required");

      const { error } = await supabase.from("alert_rules").insert({
        user_id: user.id,
        name: generateAlertRuleName(modalRegion, modalMinSeverity, modalEventType),
        regions: [modalRegion],
        min_severity: modalMinSeverity,
        channels: modalChannels,
        is_active: true,
      });

      if (error) {
        if (error.code === "23514") {
          throw new Error("Please check your alert rule settings and try again");
        }
        throw error;
      }
    },
    onSuccess: () => {
      track("alert_rule_created", { source: "alerts_page", region: modalRegion, minSeverity: modalMinSeverity });
      logFunnelEventOnce("first_alert_rule_created", { source: "alerts_page" });
      toast.success("Alert Rule Activated", {
        description: `Alerts set for ${modalRegion} (Severity >= ${modalMinSeverity})`,
      });
      setAlertModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create alert rule");
    },
  });

  return (
    <div className="ml-[256px] mr-[260px] mt-16 p-8 min-h-screen bg-surface-container-lowest text-on-surface">
      {/* Header Section */}
      <section className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter font-headline text-white">Alert Rules & Signals</h1>
          <p className="text-on-surface/60 mt-2 font-body font-medium">What you asked to be told about — your rules, and the signals that actually matched them.</p>
        </div>
        <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant/10">
          <button onClick={() => router.push("/dashboard")} className="px-6 py-2 text-on-surface/60 text-xs label font-bold uppercase tracking-wider hover:text-on-surface transition-colors cursor-pointer">Feed</button>
          <button onClick={() => router.push("/watchlist")} className="px-6 py-2 text-on-surface/60 text-xs label font-bold uppercase tracking-wider hover:text-on-surface transition-colors cursor-pointer">Watchlist</button>
          <button onClick={() => router.push("/backtesting")} className="px-6 py-2 text-on-surface/60 text-xs label font-bold uppercase tracking-wider hover:text-on-surface transition-colors cursor-pointer">Lab</button>
        </div>
      </section>

      <IngestionStatusBanner />

      {/* Rules Header + New Rule Action */}
      <section className="flex justify-between items-center py-4 border-y border-outline-variant/20 mb-8">
        <span className="label text-[10px] tracking-widest text-on-surface/40 font-bold uppercase">
          {rules.length > 0 ? `${rules.length} Alert Rule${rules.length === 1 ? "" : "s"}` : "No Alert Rules Yet"}
        </span>
        <button
          onClick={() => openSetAlertModal()}
          className="bg-[#4edea3] text-[#003824] hover:bg-[#6ffbbe] px-5 py-2 label text-[10px] font-bold tracking-widest uppercase active:scale-95 transition-all shadow-lg rounded-sm cursor-pointer"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          + New Alert Rule
        </button>
      </section>

      {isLoading || rulesError ? (
        <div className="space-y-6 pb-24">
          <Skeleton className="h-48 w-full bg-surface-container" />
          <Skeleton className="h-48 w-full bg-surface-container" />
          <Skeleton className="h-48 w-full bg-surface-container" />
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-surface-container rounded-lg border border-outline-variant/10 shadow-xl p-12 text-center flex flex-col items-center gap-4 pb-24">
          <span className="material-symbols-outlined text-4xl text-on-surface/20">notifications_off</span>
          <div>
            <h3 className="text-lg font-bold font-headline text-on-surface mb-1">No alert rules configured</h3>
            <p className="text-xs text-on-surface/60 max-w-md">
              Create a rule to get notified when signals match a region, commodity, or severity threshold you care about.
            </p>
          </div>
          <button
            onClick={() => openSetAlertModal()}
            className="bg-[#4edea3] text-[#003824] hover:bg-[#6ffbbe] px-6 py-2.5 label text-[10px] font-bold tracking-widest uppercase active:scale-95 transition-all shadow-lg rounded-sm cursor-pointer mt-2"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Set Up Your First Rule
          </button>
        </div>
      ) : (
        <div className="space-y-6 pb-24">
          {rules.map((rule) => {
            const allMatches = matchesByRule.get(rule.id) ?? [];
            const matchPage = matchPageByRule[rule.id] ?? 1;
            const matchPageCount = Math.max(
              1,
              Math.ceil(allMatches.length / MATCHES_PER_PAGE),
            );
            const matches = allMatches.slice(
              (matchPage - 1) * MATCHES_PER_PAGE,
              matchPage * MATCHES_PER_PAGE,
            );
            const regions = rule.regions?.length ? rule.regions : null;
            const commodities = rule.commodities?.length ? rule.commodities : null;
            const channels = rule.channels?.length ? rule.channels : ["telegram"];

            return (
              <div
                key={rule.id}
                className="bg-surface-container rounded-lg overflow-hidden border border-outline-variant/10 shadow-xl"
              >
                <div className="p-6 flex justify-between items-start gap-6 border-b border-outline-variant/10 bg-surface-container-high/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-bold font-headline text-on-surface truncate">{rule.name}</h3>
                      <span
                        className={`px-2 py-0.5 text-[9px] label font-bold uppercase tracking-widest rounded-sm border shrink-0 ${
                          rule.is_active
                            ? "bg-primary/10 border-primary/50 text-primary"
                            : "bg-surface-variant border-outline-variant/30 text-on-surface/40"
                        }`}
                      >
                        {rule.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="label text-[9px] text-on-surface/40 uppercase font-bold">Region:</span>
                        {regions ? (
                          regions.map((r) => (
                            <span key={r} className="mono text-[10px] text-on-surface font-bold uppercase">{r}</span>
                          ))
                        ) : (
                          <span className="mono text-[10px] text-on-surface/60 uppercase">All regions</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="label text-[9px] text-on-surface/40 uppercase font-bold">Commodity:</span>
                        {commodities ? (
                          commodities.map((c) => (
                            <span key={c} className="mono text-[10px] text-on-surface font-bold uppercase">{c}</span>
                          ))
                        ) : (
                          <span className="mono text-[10px] text-on-surface/60 uppercase">All commodities</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="label text-[9px] text-on-surface/40 uppercase font-bold">Threshold:</span>
                        <span className="mono text-[10px] text-primary font-bold">SEVERITY {rule.min_severity}+</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="label text-[9px] text-on-surface/40 uppercase font-bold">Channels:</span>
                        <span className="mono text-[10px] text-on-surface font-bold uppercase">{channels.join(" · ")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="label text-[9px] text-on-surface/40 uppercase font-bold block">Last Triggered</span>
                    <span className="mono text-xs text-on-surface/70 font-bold">
                      {rule.last_triggered_at ? `${safeFormatDistanceToNow(rule.last_triggered_at)} ago` : "Never"}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <span className="label text-[9px] tracking-widest text-on-surface/40 font-bold uppercase block mb-2 px-2">
                    Recent Matches
                  </span>
                  {matches.length === 0 ? (
                    <p className="text-xs text-on-surface/50 px-2 py-3 italic">No signals have matched this rule yet.</p>
                  ) : (
                    <div className="divide-y divide-outline-variant/10">
                      {matches.map((m) => {
                        const isHigh = m.severity >= 8;
                        const status = worstDeliveryStatus(m.deliveries);
                        return (
                          <div
                            key={m.id}
                            onClick={() => router.push(`/events/${m.id}`)}
                            className="flex items-center gap-4 px-2 py-3 hover:bg-surface-bright/20 transition-all group cursor-pointer"
                          >
                            <div className={`w-2 h-2 rounded-full shrink-0 ${isHigh ? "bg-error" : "bg-primary"}`}></div>
                            <span className="mono text-[10px] text-on-surface/40 font-bold whitespace-nowrap w-20 shrink-0">
                              {safeFormatDistanceToNow(m.matchedAt)} ago
                            </span>
                            <span className="flex-1 min-w-0 text-sm font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                              {m.title}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[8px] label font-bold uppercase tracking-widest rounded-sm border shrink-0 ${
                                status === "failed"
                                  ? "bg-error-container/20 border-error/50 text-error"
                                  : status === "queued"
                                    ? "bg-[#ffb340]/10 border-[#ffb340]/50 text-[#ffb340]"
                                    : "bg-primary/10 border-primary/50 text-primary"
                              }`}
                            >
                              {status === "failed" ? "Delivery Failed" : status === "queued" ? "Not Delivered" : "Delivered"}
                            </span>
                            <span className="material-symbols-outlined text-on-surface/20 group-hover:text-primary group-hover:translate-x-1 transition-all text-sm shrink-0">
                              chevron_right
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Pagination
                    page={matchPage}
                    pageCount={matchPageCount}
                    onPageChange={(p) =>
                      setMatchPageByRule((prev) => ({ ...prev, [rule.id]: p }))
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alert Rule Modal */}
      {alertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs" onClick={() => setAlertModalOpen(false)} />
          <div className="relative bg-[#131313] border border-[#3c4a42] rounded-lg p-6 w-full max-w-md z-50 text-white space-y-4">
            <h3 className="text-lg font-bold text-[#4edea3]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Configure Sentinel Alert Threshold
            </h3>

            <div>
              <label className="text-[10px] uppercase font-bold text-[#86948a] block mb-1">Target Region</label>
              <input
                value={modalRegion}
                onChange={(e) => setModalRegion(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-[#3c4a42] p-2 text-xs text-white rounded font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-[#86948a] block mb-1">Min Severity Threshold (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                value={modalMinSeverity}
                onChange={(e) => setModalMinSeverity(Number(e.target.value))}
                className="w-full bg-[#0e0e0e] border border-[#3c4a42] p-2 text-xs text-white rounded font-mono"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#2a2a2a]">
              <button
                onClick={() => setAlertModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-[#86948a] hover:text-white uppercase"
              >
                Cancel
              </button>
              <button
                onClick={() => createAlertRule.mutate()}
                disabled={createAlertRule.isPending}
                className="px-6 py-2 bg-[#4edea3] text-[#003824] text-xs font-bold uppercase rounded hover:bg-[#6ffbbe] transition-all"
              >
                {createAlertRule.isPending ? "Activating..." : "Save Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
