"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import type { Signal } from "@blue-beacon-research/shared";
import { FOREX_PAIRS } from "@blue-beacon-research/shared";
import { safeFormatDistanceToNow, generateAlertRuleName } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { toast } from "sonner";
import { IngestionStatusBanner } from "@/components/IngestionStatusBanner";
import { Pagination } from "@/components/ui/Pagination";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { logFunnelEventOnce, logUsageEvent, signalEventMetadata } from "@/lib/funnel-events";

type AlertRule = {
  id: string;
  name: string;
  regions: string[];
  commodities: string[];
  forex_pairs: string[];
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

const CHANNEL_OPTIONS = [
  { id: "telegram", label: "Telegram" },
  { id: "discord", label: "Discord" },
  { id: "slack", label: "Slack" },
] as const;

type ConnectedChannels = {
  telegram: boolean;
  discord: boolean;
  slack: boolean;
};

function defaultChannelsFrom(connected: ConnectedChannels | null | undefined): string[] {
  if (!connected) return ["telegram"];
  const next = CHANNEL_OPTIONS.map((c) => c.id).filter((id) => connected[id]);
  return next.length ? [...next] : ["telegram"];
}

async function fetchConnectedChannels(): Promise<ConnectedChannels> {
  const empty = { telegram: false, discord: false, slack: false };
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return empty;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;
  const { data } = await supabase
    .from("user_channels")
    .select("telegram_chat_id, discord_webhook_url, slack_webhook_url")
    .eq("user_id", user.id)
    .maybeSingle();
  return {
    telegram: Boolean(data?.telegram_chat_id),
    discord: Boolean(data?.discord_webhook_url),
    slack: Boolean(data?.slack_webhook_url),
  };
}

// The one compliance line BBR shows on every signal surface — approved wording from
// docs/claude_project/00_PROJECT.md §7 / 20_RISKS.md / 21_PROJECT_BRIEFING.md.
const DISCLAIMER =
  "Blue Beacon Research surfaces geopolitical signals for your own analysis. Intelligence for informational purposes only — not financial advice, and never a buy or sell recommendation.";

type MatchSource = { title: string; url: string | null; sourceLabel: string | null };

type MatchedSignal = {
  id: string;
  title: string;
  severity: number;
  summary: string | null;
  aiAnalysis: string | null;
  region: string | null;
  commodityImpacts: Signal["commodityImpacts"];
  currencyPairImpacts: Signal["commodityImpacts"];
  isBreaking: boolean;
  eventDate?: string | null;
  matchedAt: string;
  sources: MatchSource[];
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
    summary?: string | null;
    ai_analysis?: string | null;
    region?: string | null;
    commodity_impacts?: Signal["commodityImpacts"] | null;
    currency_pair_impacts?: Signal["commodityImpacts"] | null;
    is_breaking?: boolean | null;
    event_date?: string | null;
    sources?: MatchSource[];
  } | null;
};

function worstDeliveryStatus(deliveries: { status: DeliveryStatus }[]): DeliveryStatus {
  if (deliveries.some((d) => d.status === "failed")) return "failed";
  if (deliveries.some((d) => d.status === "queued")) return "queued";
  return "delivered";
}

/** One labelled block of an alert card — Event / Why it matters / Which instruments / Threshold. */
function CardSection({
  step,
  label,
  children,
}: {
  step: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-3 border-t border-outline-variant/10 first:border-t-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-4 h-4 shrink-0 rounded-sm bg-primary/15 text-primary text-[9px] font-bold flex items-center justify-center mono">
          {step}
        </span>
        <span className="label text-[9px] tracking-widest text-outline font-bold uppercase">{label}</span>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [modalRegion, setModalRegion] = useState("middle-east");
  const [modalMinSeverity, setModalMinSeverity] = useState(7);
  const [modalChannels, setModalChannels] = useState<string[]>(["telegram"]);
  const [modalEventType, setModalEventType] = useState<string | undefined>(undefined);
  // Forex pairs this rule follows — matched against signal.currency_pair_impacts by
  // the backend dispatcher, OR'd with commodities (#87 phase 3). Empty = not filtered
  // on forex.
  const [modalForexPairs, setModalForexPairs] = useState<string[]>([]);
  // Per-rule page index for the "Recent Matches" list (client-side — paginates
  // the already-fetched, already-grouped matches for that rule).
  const [matchPageByRule, setMatchPageByRule] = useState<Record<string, number>>({});
  // Local echo of the threshold control so the number input stays responsive while
  // the save round-trips.
  const [thresholdDraft, setThresholdDraft] = useState<Record<string, number>>({});

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

  const { data: connectedChannels } = useQuery({
    queryKey: ["user-channels", "connected"],
    queryFn: fetchConnectedChannels,
  });

  const rules = rulesData?.rules ?? [];
  const isLoading = rulesLoading || alertsLoading;

  const updateThreshold = useMutation({
    mutationFn: async ({ ruleId, minSeverity }: { ruleId: string; minSeverity: number }) => {
      if (minSeverity < 1 || minSeverity > 10) throw new Error("Severity must be between 1 and 10");
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase client not available");
      const { error } = await supabase
        .from("alert_rules")
        .update({ min_severity: minSeverity })
        .eq("id", ruleId);
      if (error) throw error;
    },
    onSuccess: (_d, { minSeverity }) => {
      track("alert_rule_threshold_changed", { minSeverity });
      toast.success("Threshold updated", { description: `Now alerting only at severity ${minSeverity}+` });
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update threshold"),
  });

  // Real alerts_sent rows only, grouped per rule then per signal (a signal can have
  // one alerts_sent row per delivery channel) — this is what "matched" a rule actually
  // means: a dispatch attempt the backend already made, per the matching logic in
  // apps/backend/src/workers/alert-dispatcher.ts. Nothing here re-derives or guesses
  // matches client-side.
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
          summary: row.signals.summary ?? null,
          aiAnalysis: row.signals.ai_analysis ?? null,
          region: row.signals.region ?? null,
          commodityImpacts: row.signals.commodity_impacts ?? [],
          currencyPairImpacts: row.signals.currency_pair_impacts ?? [],
          isBreaking: Boolean(row.signals.is_breaking),
          eventDate: row.signals.event_date,
          matchedAt: row.created_at,
          sources: row.signals.sources ?? [],
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

  // The disclaimer is shown once on the page — attached to the first matched-signal
  // card that actually renders (first rule, in list order, that has ≥1 match).
  const disclaimerAnchor = useMemo(() => {
    for (const rule of rules) {
      const m = matchesByRule.get(rule.id);
      if (m && m.length > 0) return { ruleId: rule.id, signalId: m[0].id };
    }
    return null;
  }, [rules, matchesByRule]);

  const openSetAlertModal = async (signal?: Signal) => {
    if (signal) {
      setModalRegion(signal.region || "middle-east");
      setModalMinSeverity(Math.max(1, signal.severity - 1));
      setModalEventType(signal.eventType);
    } else {
      setModalRegion("middle-east");
      setModalMinSeverity(7);
      setModalEventType(undefined);
    }
    const connected = await queryClient.fetchQuery({
      queryKey: ["user-channels", "connected"],
      queryFn: fetchConnectedChannels,
    });
    setModalChannels(defaultChannelsFrom(connected));
    setModalForexPairs([]);
    setAlertModalOpen(true);
  };

  const toggleModalChannel = (id: string) => {
    setModalChannels((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((c) => c !== id);
        return next.length ? next : prev;
      }
      return [...prev, id];
    });
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
        forex_pairs: modalForexPairs,
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
      logUsageEvent("alert_rule_created", { source: "alerts_page" }, false);
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
        <span className="label text-[10px] tracking-widest text-outline font-bold uppercase">
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
            <h2 className="text-lg font-bold font-headline text-on-surface mb-1">No alert rules configured</h2>
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
            const forexPairs = rule.forex_pairs?.length ? rule.forex_pairs : null;
            const channels = rule.channels?.length ? rule.channels : ["telegram"];
            const threshold = thresholdDraft[rule.id] ?? rule.min_severity;

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
                            : "bg-surface-variant border-outline-variant/30 text-on-surface-variant"
                        }`}
                      >
                        {rule.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="label text-[9px] text-outline uppercase font-bold">Region:</span>
                        {regions ? (
                          regions.map((r) => (
                            <span key={r} className="mono text-[10px] text-on-surface font-bold uppercase">{r}</span>
                          ))
                        ) : (
                          <span className="mono text-[10px] text-on-surface/60 uppercase">All regions</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="label text-[9px] text-outline uppercase font-bold">Commodity:</span>
                        {commodities ? (
                          commodities.map((c) => (
                            <span key={c} className="mono text-[10px] text-on-surface font-bold uppercase">{c}</span>
                          ))
                        ) : (
                          <span className="mono text-[10px] text-on-surface/60 uppercase">All commodities</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="label text-[9px] text-outline uppercase font-bold">Forex:</span>
                        {forexPairs ? (
                          forexPairs.map((f) => (
                            <span key={f} className="mono text-[10px] text-on-surface font-bold uppercase">{f}</span>
                          ))
                        ) : (
                          <span className="mono text-[10px] text-on-surface/60 uppercase">All pairs</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="label text-[9px] text-outline uppercase font-bold">Channels:</span>
                        <span className="mono text-[10px] text-on-surface font-bold uppercase">{channels.join(" · ")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="label text-[9px] text-outline uppercase font-bold block">Last Triggered</span>
                    <span className="mono text-xs text-on-surface/70 font-bold">
                      {rule.last_triggered_at ? `${safeFormatDistanceToNow(rule.last_triggered_at)} ago` : "Never"}
                    </span>
                  </div>
                </div>

                {/* Alert threshold control — surfaced prominently, not buried in the "new rule" modal */}
                <div className="px-6 py-4 bg-primary/[0.04] border-b border-outline-variant/10 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <span className="label text-[10px] tracking-widest text-primary font-bold uppercase block">
                      Alert only above this threshold
                    </span>
                    <span className="text-[11px] text-on-surface/60">
                      This rule notifies you only when a matching signal reaches at least this severity (1–10).
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={threshold}
                      onChange={(e) =>
                        setThresholdDraft((p) => ({ ...p, [rule.id]: Number(e.target.value) }))
                      }
                      className="w-16 bg-surface-container-lowest border border-outline-variant/40 p-2 text-sm text-on-surface rounded font-mono text-center focus:border-primary focus:outline-none"
                    />
                    <button
                      disabled={updateThreshold.isPending || threshold === rule.min_severity}
                      onClick={() => updateThreshold.mutate({ ruleId: rule.id, minSeverity: threshold })}
                      className="px-4 py-2 bg-primary text-black text-[10px] font-bold uppercase tracking-widest rounded-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all cursor-pointer"
                    >
                      {threshold === rule.min_severity ? `Severity ${rule.min_severity}+` : "Save"}
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  <span className="label text-[9px] tracking-widest text-outline font-bold uppercase block mb-3 px-2">
                    Recent Matches
                  </span>
                  {matches.length === 0 ? (
                    <p className="text-xs text-on-surface/50 px-2 py-3 italic">No signals have matched this rule yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {matches.map((m) => {
                        const status = worstDeliveryStatus(m.deliveries);
                        const showDisclaimer =
                          disclaimerAnchor?.ruleId === rule.id && disclaimerAnchor?.signalId === m.id;
                        return (
                          <div key={m.id}>
                            <div className="rounded-lg border border-outline-variant/15 bg-surface-container-low overflow-hidden">
                              {/* ── 1. EVENT ── */}
                              <CardSection step={1} label="Event">
                                <button
                                  onClick={() => {
                                    logUsageEvent(
                                      "signal_viewed",
                                      signalEventMetadata({
                                        id: m.id,
                                        region: m.region,
                                        commodityImpacts: m.commodityImpacts,
                                        currencyPairImpacts: m.currencyPairImpacts,
                                      }),
                                      false,
                                    );
                                    router.push(`/events/${m.id}`);
                                  }}
                                  className="text-left w-full group"
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {m.isBreaking && (
                                      <span className="px-1.5 py-0.5 text-[8px] label font-bold uppercase tracking-widest rounded-sm bg-error/15 text-error border border-error/40">
                                        Breaking
                                      </span>
                                    )}
                                    <span className="px-1.5 py-0.5 text-[8px] label font-bold uppercase tracking-widest rounded-sm bg-surface-variant text-on-surface-variant border border-outline-variant/30">
                                      Severity {m.severity}
                                    </span>
                                    <span className="mono text-[10px] text-outline font-bold">
                                      {safeFormatDistanceToNow(m.matchedAt)} ago
                                    </span>
                                    <span
                                      className={`ml-auto px-2 py-0.5 text-[8px] label font-bold uppercase tracking-widest rounded-sm border ${
                                        status === "failed"
                                          ? "bg-error-container/20 border-error/50 text-error"
                                          : status === "queued"
                                            ? "bg-[#ffb340]/10 border-[#ffb340]/50 text-[#ffb340]"
                                            : "bg-primary/10 border-primary/50 text-primary"
                                      }`}
                                    >
                                      {status === "failed" ? "Delivery Failed" : status === "queued" ? "Not Delivered" : "Delivered"}
                                    </span>
                                  </div>
                                  <p className="mt-1.5 text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                                    {m.title}
                                  </p>
                                </button>
                              </CardSection>

                              {/* ── 2. WHY IT MATTERS ── */}
                              <CardSection step={2} label="Why it matters">
                                {m.aiAnalysis ? (
                                  <div className="text-[13px] text-on-surface/80 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_p+p]:mt-2">
                                    <ReactMarkdown
                                      allowedElements={["p", "strong", "em", "ul", "ol", "li"]}
                                      unwrapDisallowed
                                    >
                                      {m.aiAnalysis}
                                    </ReactMarkdown>
                                  </div>
                                ) : m.summary ? (
                                  <div>
                                    <p className="text-[13px] text-on-surface/80 leading-relaxed">{m.summary}</p>
                                    <p className="mt-1.5 text-[10px] text-on-surface/45 italic">
                                      Deeper analyst commentary wasn&apos;t available for this signal — showing the
                                      event summary instead.
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-on-surface/45 italic">
                                    No summary available for this signal yet.
                                  </p>
                                )}
                              </CardSection>

                              {/* ── 3. WHICH INSTRUMENTS ── */}
                              <CardSection step={3} label="Which instruments">
                                {m.commodityImpacts.length + m.currencyPairImpacts.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {[...m.commodityImpacts, ...m.currencyPairImpacts].map((c) => (
                                      <CommodityChip
                                        key={c.asset}
                                        asset={c.asset}
                                        direction={c.direction}
                                        confidence={c.confidence}
                                        size="md"
                                      />
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-on-surface/45 italic">
                                    No specific instruments were flagged for this event.
                                  </p>
                                )}
                              </CardSection>

                              {/* ── 4. ALERT THRESHOLD ── */}
                              <CardSection step={4} label="Alert threshold">
                                <p className="text-[12px] text-on-surface/70">
                                  Delivered because it cleared{" "}
                                  <span className="font-bold text-on-surface">{rule.name}</span>&apos;s threshold —
                                  severity{" "}
                                  <span className="mono font-bold text-primary">{rule.min_severity}+</span>. Raise the
                                  threshold above to hear about fewer, higher-severity events.
                                </p>
                              </CardSection>

                              {/* ── Persistent trust element: source link(s) ── */}
                              {m.sources.length > 0 && (
                                <div className="px-4 py-2.5 border-t border-outline-variant/10 bg-surface-container/40 flex items-start gap-2 flex-wrap">
                                  <span className="label text-[9px] tracking-widest text-outline font-bold uppercase mt-0.5">
                                    Built from
                                  </span>
                                  <div className="flex flex-col gap-1">
                                    {m.sources.map((s, i) => (
                                      <a
                                        key={i}
                                        href={s.url ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() =>
                                          logUsageEvent(
                                            "signal_source_clicked",
                                            signalEventMetadata({
                                              id: m.id,
                                              region: m.region,
                                              commodityImpacts: m.commodityImpacts,
                                              currencyPairImpacts: m.currencyPairImpacts,
                                            }),
                                            false,
                                          )
                                        }
                                        className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                                      >
                                        <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                                        <span className="truncate max-w-[420px]">
                                          {s.sourceLabel ? `${s.sourceLabel} — ` : ""}
                                          {s.title}
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Disclaimer — once per page, attached to the first card */}
                            {showDisclaimer && (
                              <p className="mt-2 px-1 text-[10px] leading-relaxed text-on-surface/45">
                                {DISCLAIMER}
                              </p>
                            )}
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

            <div data-testid="alert-channel-checkboxes">
              <label className="text-[10px] uppercase font-bold text-[#86948a] block mb-1">
                Delivery Channels
              </label>
              <p className="text-[10px] text-[#6b7674] mb-2">
                Alerts go only to the channels you select. Connect them in Settings first.
              </p>
              <div className="flex flex-col gap-2">
                {CHANNEL_OPTIONS.map((ch) => {
                  const checked = modalChannels.includes(ch.id);
                  const isConnected = Boolean(connectedChannels?.[ch.id]);
                  return (
                    <label
                      key={ch.id}
                      className="flex items-center gap-2 text-xs text-white cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        data-testid={`alert-channel-${ch.id}`}
                        checked={checked}
                        onChange={() => toggleModalChannel(ch.id)}
                      />
                      <span>{ch.label}</span>
                      <span
                        className={`text-[9px] uppercase font-bold ${
                          isConnected ? "text-[#4edea3]" : "text-[#86948a]"
                        }`}
                      >
                        {isConnected ? "Connected" : "Not connected"}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-[#86948a] block mb-1">
                Forex Pairs (optional)
              </label>
              <p className="text-[10px] text-[#6b7674] mb-2">
                Leave empty to match on region alone. Any pair selected here also triggers this rule.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {FOREX_PAIRS.map((f) => {
                  const active = modalForexPairs.includes(f.symbol);
                  return (
                    <button
                      key={f.symbol}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setModalForexPairs((prev) =>
                          prev.includes(f.symbol)
                            ? prev.filter((s) => s !== f.symbol)
                            : [...prev, f.symbol],
                        )
                      }
                      className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded border transition-colors cursor-pointer ${
                        active
                          ? "bg-[#4edea3] text-[#003824] border-[#4edea3]"
                          : "bg-[#0e0e0e] text-[#86948a] border-[#3c4a42] hover:text-white"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
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
