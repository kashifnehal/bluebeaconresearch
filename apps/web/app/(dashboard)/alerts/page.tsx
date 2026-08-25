"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Signal } from "@blue-beacon-research/shared";
import { safeFormatDistanceToNow, generateAlertRuleName } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { IngestionStatusBanner } from "@/components/IngestionStatusBanner";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { track } from "@/lib/analytics";

export default function AlertsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [modalRegion, setModalRegion] = useState("middle-east");
  const [modalMinSeverity, setModalMinSeverity] = useState(7);
  const [modalChannels, setModalChannels] = useState<string[]>(["telegram"]);
  const [modalEventType, setModalEventType] = useState<string | undefined>(undefined);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["signals", "feed"],
    queryFn: async () => {
      const res = await fetch("/api/signals?sort=severity");
      if (!res.ok) throw new Error("Failed to fetch signals");
      return (await res.json()) as { signals: Signal[] };
    },
    refetchInterval: 30_000,
  });

  const signals = data?.signals ?? [];

  const filteredSignals = useMemo(() => {
    if (filter === "all") return signals;
    if (filter === "high") return signals.filter((s) => s.severity >= 8);
    if (filter === "medium") return signals.filter((s) => s.severity >= 4 && s.severity < 8);
    return signals.filter((s) => s.severity < 4);
  }, [signals, filter]);

  const featuredSignal = signals.find((s) => s.severity >= 8) || signals[0];
  const secondarySignal = signals.find((s) => s.id !== featuredSignal?.id) || signals[1];
  const tableSignals = filteredSignals.slice(0, 8);

  const openSetAlertModal = (signal?: Signal) => {
    if (signal) {
      setModalRegion(signal.region || "middle-east");
      setModalMinSeverity(Math.max(1, signal.severity - 1));
      setModalEventType(signal.eventType);
    } else {
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
      toast.success("Alert Rule Activated", {
        description: `Alerts set for ${modalRegion} (Severity >= ${modalMinSeverity})`,
      });
      setAlertModalOpen(false);
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
          <p className="text-on-surface/60 mt-2 font-body font-medium">Real-time global signal monitoring and automated risk thresholds.</p>
        </div>
        <div className="flex bg-surface-container-low p-1 rounded-lg border border-outline-variant/10">
          <button className="px-6 py-2 bg-primary text-black text-xs label font-bold rounded-md uppercase tracking-wider">All Signals</button>
          <button onClick={() => router.push("/watchlist")} className="px-6 py-2 text-on-surface/60 text-xs label font-bold uppercase tracking-wider hover:text-on-surface transition-colors cursor-pointer">Watchlist</button>
          <button onClick={() => router.push("/backtesting")} className="px-6 py-2 text-on-surface/60 text-xs label font-bold uppercase tracking-wider hover:text-on-surface transition-colors cursor-pointer">Lab</button>
        </div>
      </section>

      <IngestionStatusBanner />

      {/* Filters Bar */}
      <section className="flex justify-between items-center py-4 border-y border-outline-variant/20 mb-8">
        <div className="flex items-center gap-6">
          <span className="label text-[10px] tracking-widest text-on-surface/40 font-bold uppercase">Severity Filter:</span>
          <div className="flex gap-2">
            <button 
              onClick={() => setFilter("all")}
              className={`px-3 py-1 text-[10px] label font-bold rounded-sm uppercase transition-all cursor-pointer ${filter === 'all' ? 'bg-primary text-black' : 'bg-surface-variant text-on-surface-variant hover:bg-surface-bright'}`}
            >GLOBAL</button>
            <button 
              onClick={() => setFilter("high")}
              className={`px-3 py-1 text-[10px] label font-bold rounded-sm uppercase transition-all cursor-pointer ${filter === 'high' ? 'bg-error-container text-on-error-container' : 'bg-error-container/20 text-error-container hover:bg-error-container/40'}`}
            >HIGH (8+)</button>
            <button 
              onClick={() => setFilter("medium")}
              className={`px-3 py-1 text-[10px] label font-bold rounded-sm uppercase transition-all cursor-pointer ${filter === 'medium' ? 'bg-[#ffb340]/40 text-[#ffb340]' : 'bg-[#ffb340]/10 text-[#ffb340] hover:bg-[#ffb340]/20'}`}
            >MEDIUM (4-7)</button>
            <button 
              onClick={() => setFilter("low")}
              className={`px-3 py-1 text-[10px] label font-bold rounded-sm uppercase transition-all cursor-pointer ${filter === 'low' ? 'bg-primary/40 text-primary' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
            >LOW (&lt;4)</button>
          </div>
        </div>
      </section>

      {/* Continuous Skeleton Loaders on API Fetch / Error */}
      {isLoading || isError ? (
        <div className="grid grid-cols-12 gap-6 pb-24">
          <div className="col-span-8">
            <Skeleton className="h-96 w-full bg-surface-container" />
          </div>
          <div className="col-span-4">
            <Skeleton className="h-96 w-full bg-surface-container" />
          </div>
          <div className="col-span-12">
            <Skeleton className="h-64 w-full bg-surface-container" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6 pb-24">
          {/* Featured Card (8-col) */}
          {featuredSignal ? (
            <div 
              onClick={() => router.push(`/events/${featuredSignal.id}`)}
              className="col-span-8 bg-surface-container rounded-lg overflow-hidden flex flex-col relative border border-outline-variant/10 shadow-xl group cursor-pointer"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-error"></div>
              <div className="p-8 flex-1">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-on-error-container/10 rounded-full flex items-center justify-center border border-on-error-container/20">
                      <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                    </div>
                    <div>
                      <span className="label text-[10px] text-error font-bold tracking-[0.2em] uppercase">Critical Intelligence Event</span>
                      <h2 className="text-2xl font-bold font-headline mt-1 text-on-surface line-clamp-1 group-hover:text-primary transition-colors">{featuredSignal.title}</h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-[10px] text-on-surface/40 uppercase tracking-widest font-bold">
                      {safeFormatDistanceToNow(featuredSignal.eventDate ?? featuredSignal.createdAt)} ago
                    </div>
                    <div className="mono text-sm text-error font-bold mt-1">
                      SEVERITY {featuredSignal.severity}.0
                    </div>
                  </div>
                </div>

                <p className="text-sm font-body text-on-surface/80 leading-relaxed mb-6 font-medium">
                  {featuredSignal.summary}
                </p>

                <div className="bg-surface-container-high/80 border border-outline-variant/20 p-4 rounded flex justify-between items-center mb-6">
                  <div>
                    <span className="label text-[9px] text-on-surface/40 uppercase font-bold block">Country Node</span>
                    <span className="mono text-xs font-bold text-on-surface uppercase">{featuredSignal.country}</span>
                  </div>
                  <div>
                    <span className="label text-[9px] text-on-surface/40 uppercase font-bold block">Signal Confidence</span>
                    <span className="mono text-xs font-bold text-primary">{Math.round(featuredSignal.confidence * 100)}%</span>
                  </div>
                </div>
              </div>

              {/* TASK 5 — Fixed Button: Renamed + Green Accent Style */}
              <div className="bg-surface-container-high/50 p-4 border-t border-outline-variant/10 flex justify-between items-center">
                <p className="text-xs font-body text-on-surface/60 font-medium italic">Automated sentinel monitoring active for this event class.</p>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    openSetAlertModal(featuredSignal);
                  }}
                  className="bg-[#4edea3] text-[#003824] hover:bg-[#6ffbbe] px-6 py-2.5 label text-[10px] font-bold tracking-widest uppercase active:scale-95 transition-all shadow-lg rounded-sm cursor-pointer"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Set Alert for This Signal
                </button>
              </div>
            </div>
          ) : null}

          {/* Secondary Card (4-col) */}
          {secondarySignal ? (
            <div 
              onClick={() => router.push(`/events/${secondarySignal.id}`)}
              className="col-span-4 bg-surface-container rounded-lg p-6 border border-outline-variant/10 shadow-xl flex flex-col relative overflow-hidden group cursor-pointer"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-primary/40"></div>
              <div className="flex justify-between items-center mb-6">
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] label font-bold tracking-[0.2em] rounded-sm uppercase border border-primary/20">Escalating</span>
                <span className="mono text-[10px] text-on-surface/40 font-bold">#SIG-{secondarySignal.id.slice(-4).toUpperCase()}</span>
              </div>
              <h3 className="text-lg font-bold font-headline leading-tight mb-4 text-on-surface group-hover:text-primary transition-colors">
                {secondarySignal.title}
              </h3>
              <p className="text-xs text-on-surface/70 line-clamp-3 mb-6 font-medium">
                {secondarySignal.summary}
              </p>
              <div className="mt-auto pt-6 border-t border-outline-variant/10 flex justify-between items-center">
                <span className="mono text-[10px] text-primary font-bold">{Math.round(secondarySignal.confidence * 100)}% CONFIDENCE</span>
                <span className="material-symbols-outlined text-primary group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </div>
            </div>
          ) : null}

          {/* TASK 7 — Geospatial Intelligence Stream Table (Clickable Rows) */}
          <div className="col-span-12 bg-surface-container rounded-lg overflow-hidden flex flex-col border border-outline-variant/10 shadow-xl mt-4">
            <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container/30">
              <h3 className="label text-xs font-bold tracking-widest text-on-surface/60 uppercase">Geospatial Intelligence Stream</h3>
              <span className="mono text-[10px] text-primary">LIVE INGESTION</span>
            </div>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Geospatial intelligence stream table">
              <table className="w-full">
                <tbody className="divide-y divide-outline-variant/10">
                  {tableSignals.length > 0 ? (
                    tableSignals.map((signal) => {
                      const isHigh = signal.severity >= 8;
                      const isMedium = signal.severity >= 4 && signal.severity < 8;
                      
                      return (
                        <tr 
                          key={signal.id} 
                          onClick={() => router.push(`/events/${signal.id}`)}
                          className="hover:bg-surface-bright/20 transition-all group cursor-pointer border-l-2 border-transparent hover:border-primary"
                        >
                          <td className="px-6 py-4 w-4">
                            <div className={`w-2 h-2 rounded-full ${isHigh ? 'bg-error pulse-red' : (isMedium ? 'bg-[#ffb340]' : 'bg-primary')}`}></div>
                          </td>
                          <td className="px-2 py-4 mono text-[10px] text-on-surface/40 whitespace-nowrap font-bold">
                            {safeFormatDistanceToNow(signal.eventDate ?? signal.createdAt)} ago
                          </td>
                          <td className="px-6 py-4 font-headline text-sm font-bold text-on-surface line-clamp-1 group-hover:text-primary transition-colors">
                            {signal.title}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className={`px-2 py-0.5 border text-[8px] label font-bold uppercase tracking-widest rounded-sm ${isHigh ? 'bg-error-container/20 border-error/50 text-error' : (isMedium ? 'bg-[#ffb340]/10 border-[#ffb340]/50 text-[#ffb340]' : 'bg-primary/10 border-primary/50 text-primary')}`}>
                              {isHigh ? 'CRITICAL' : (isMedium ? 'HIGH' : 'NOTICE')}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="material-symbols-outlined text-on-surface/20 group-hover:text-primary group-hover:translate-x-1 transition-all text-sm">chevron_right</span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-12 text-center opacity-40">
                        <span className="label text-[10px] tracking-widest uppercase font-bold">No active signals found</span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
