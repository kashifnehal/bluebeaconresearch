"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Database,
  MapPin,
  Share2,
  Bookmark,
  ChevronLeft,
  Shield,
  Target,
  Zap,
  ExternalLink,
} from "lucide-react";

import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { CommodityChip } from "@/components/signals/CommodityChip";
import { EventLocationMap } from "@/components/signals/EventLocationMap";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { Signal } from "@blue-beacon-research/shared";
import type { EventDetailResponse } from "@/app/api/signals/[id]/route";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { generateAlertRuleName, formatRegionLabel, safeFormatDistanceToNow } from "@/lib/utils";
import { getSignalCoordinates } from "@/lib/geo-coords";
import { toast } from "sonner";

function eventTypeLabel(eventType?: string | null): string {
  if (!eventType) return "this event";
  return eventType
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["signal", id],
    queryFn: async () => {
      const res = await fetch(`/api/signals/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error === "not_found" ? "not_found" : "fetch_failed");
      }
      return (await res.json()) as EventDetailResponse;
    },
    retry: false,
  });

  const signal = data?.signal;

  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [modalRegion, setModalRegion] = useState<string>(signal?.region || "middle-east");
  const [modalMinSeverity, setModalMinSeverity] = useState(
    Math.max(1, (signal?.severity || 7) - 1),
  );
  const [modalChannels, setModalChannels] = useState<string[]>(["telegram"]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-app" style={{ backgroundColor: "var(--bg-app)" }}>
        <span className="text-[10px] font-black uppercase tracking-widest text-muted">
          Loading signal…
        </span>
      </div>
    );
  }

  if (error || !signal) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-app" style={{ backgroundColor: "var(--bg-app)" }}>
        <span className="text-sm font-black uppercase tracking-widest text-text-primary">
          Signal not found
        </span>
        <p className="text-xs text-muted max-w-sm text-center">
          This signal doesn't exist or is no longer available. It may have been superseded by a
          newer signal for the same event.
        </p>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>
          Back to Command Center
        </Button>
      </div>
    );
  }

  const sources = data.sources ?? [];
  const historicalComparisons = data.historicalComparisons ?? [];
  const pricesAtSignal = data.pricesAtSignal ?? [];

  const hasPreciseLocation =
    typeof signal.lat === "number" &&
    typeof signal.lng === "number" &&
    (signal.lat !== 0 || signal.lng !== 0);
  const [mapLng, mapLat] = getSignalCoordinates(signal);

  const createAlertRule = async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase client not available");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required");

      const { error } = await supabase.from("alert_rules").insert({
        user_id: user.id,
        name: generateAlertRuleName(modalRegion, modalMinSeverity, signal.eventType),
        regions: [modalRegion],
        min_severity: modalMinSeverity,
        channels: modalChannels,
        is_active: true,
      });
      if (error) throw error;
      toast.success("Alert Rule Activated", {
        description: `Alerts set for ${modalRegion} (Severity >= ${modalMinSeverity})`,
      });
      setAlertModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create alert rule");
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Copied event link to clipboard");
    } catch (err) {
      toast.error("Failed to copy link");
    }
  };

  const handleRecord = () => {
    try {
      const key = "bb.saved_signals";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.unshift({
        id: signal.id,
        title: signal.title,
        createdAt: Date.now(),
      });
      localStorage.setItem(key, JSON.stringify(existing.slice(0, 100)));
      toast.success("Saved to Recorded Signals");
    } catch (err) {
      toast.error("Failed to record signal");
    }
  };

  return (
    <div
      className="h-full flex flex-col bg-app"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      {/* ── Breadcrumbs ─────────────────────────────────────────── */}
      <nav className="px-8 pt-6 pb-2">
        <button
          onClick={() => router.back()}
          className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted hover:text-accent transition-colors"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          <ChevronLeft
            size={14}
            className="group-hover:-translate-x-1 transition-transform"
          />
          Back to Command Center
        </button>
      </nav>

      <div className="flex-1 p-8 pt-4 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1280px]">
          {/* ── Hero Section ──────────────────────────────────────── */}
          <header className="flex flex-col xl:flex-row gap-10 items-start mb-12">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <div className="px-3 py-1 bg-accent/10 border border-accent/20 rounded-sm">
                  <span
                    className="text-[10px] font-black uppercase tracking-widest text-accent"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Signal ID: {signal.id.slice(0, 8)}
                  </span>
                </div>
                <SeverityBadge score={signal.severity} />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted">
                  Acknowledge Status: ACTIVE
                </span>
              </div>

              <h1 className="text-5xl font-black text-text-primary tracking-tighter leading-[0.9] mb-8">
                {signal.title}
              </h1>

              <div
                className="grid grid-cols-3 gap-6 p-6 rounded-lg bg-surface/30 border"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center gap-3">
                  <Clock size={16} className="text-accent" />
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted">
                      Published
                    </span>
                    <span className="text-xs font-mono font-bold text-text-secondary">
                      {new Date(
                        signal.eventDate ?? signal.createdAt,
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div
                  className="flex items-center gap-3 border-x px-6"
                  style={{ borderColor: "rgba(255,255,255,0.05)" }}
                >
                  <Database size={16} className="text-accent" />
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted">
                      Verification
                    </span>
                    <span className="text-xs font-mono font-bold text-text-secondary">
                      {signal.sourcesCount} High-Integrity Sources
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-accent" />
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted">
                      Location
                    </span>
                    <span className="text-xs font-mono font-bold text-text-secondary uppercase">
                      {signal.country}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <aside className="w-full xl:w-[320px] space-y-4">
              <div
                className="relative p-6 rounded-lg bg-surface border overflow-hidden"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                {/* Decorative background scanlines */}
                <div
                  className="absolute inset-0 opacity-[0.03] pointer-events-none"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, transparent, transparent 2px, #fff 3px)",
                  }}
                />

                <div className="flex items-center gap-2 mb-6">
                  <Target size={14} className="text-accent" />
                  <span
                    className="text-[10px] font-black uppercase tracking-[0.2em] text-text-primary"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    PROJECTED IMPACT
                  </span>
                </div>

                {signal.commodityImpacts.length > 0 ? (
                  <div className="space-y-3">
                    {signal.commodityImpacts.map((c) => {
                      const priceInfo = pricesAtSignal.find((p) => p.asset === c.asset);
                      return (
                        <div key={c.asset} className="space-y-1">
                          <CommodityChip
                            asset={c.asset}
                            direction={c.direction}
                            confidence={c.confidence}
                            size="md"
                          />
                          {priceInfo?.priceAtSignal != null && priceInfo?.currentPrice != null && (
                            <p className="text-[9px] font-mono text-muted pl-1">
                              {c.asset} was ${priceInfo.priceAtSignal.toFixed(2)} when this fired.
                              Now: ${priceInfo.currentPrice.toFixed(2)} (
                              {priceInfo.currentPrice >= priceInfo.priceAtSignal ? "+" : ""}
                              {(
                                ((priceInfo.currentPrice - priceInfo.priceAtSignal) /
                                  priceInfo.priceAtSignal) *
                                100
                              ).toFixed(1)}
                              %)
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] font-mono text-muted">
                    No direct commodity impact identified for this event.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => setAlertModalOpen(true)}
                  className="h-11 bg-accent text-bg-app text-[9px] font-black uppercase tracking-widest rounded-sm shadow-[0_4px_15px_rgba(78,222,163,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Zap size={14} className="mr-2" /> CREATE SEVERE ALERT
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={handleShare}
                    variant="outline"
                    className="h-11 border-border text-[9px] font-black uppercase tracking-widest rounded-sm"
                  >
                    <Share2 size={14} className="mr-2" /> SHARE
                  </Button>
                  <Button
                    onClick={handleRecord}
                    variant="outline"
                    className="h-11 border-border text-[9px] font-black uppercase tracking-widest rounded-sm"
                  >
                    <Bookmark size={14} className="mr-2" /> RECORD
                  </Button>
                </div>
              </div>
            </aside>
          </header>

          {/* ── Deep Dive Analysis ─────────────────────────────────── */}
          <Tabs defaultValue="analysis" className="w-full">
            <TabsList
              className="bg-surface/30 border-b w-full justify-start rounded-none h-auto p-0 gap-8"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              {["analysis", "historical", "map", "sources"].map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className="bg-transparent border-0 border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-accent rounded-none px-2 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-muted transition-all"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {tab === "analysis" && <Shield size={14} className="mr-2" />}
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="py-8">
              {/* ── ANALYSIS TAB ─────────────────────────────────── */}
              <TabsContent value="analysis" className="m-0 outline-none">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
                  <div className="md:col-span-8 space-y-8">
                    <div className="prose prose-invert max-w-none">
                      <div
                        className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-4"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        Signal Summary
                      </div>
                      <p className="text-xl text-text-secondary leading-relaxed font-medium">
                        {signal.summary}
                      </p>
                    </div>

                    <div>
                      <div
                        className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-4"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        Full Analyst Briefing
                      </div>
                      {signal.aiAnalysis ? (
                        <p className="text-base text-text-secondary leading-relaxed whitespace-pre-line">
                          {signal.aiAnalysis}
                        </p>
                      ) : (
                        <div
                          className="p-8 rounded-lg bg-surface/20 border border-dashed text-center"
                          style={{ borderColor: "var(--border-subtle)" }}
                        >
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted">
                            Full analyst briefing pending — restoring as intelligence capacity is
                            added back online.
                          </p>
                        </div>
                      )}
                    </div>

                    {signal.commodityImpacts.length > 0 && (
                      <div className="space-y-3">
                        <div
                          className="text-[10px] font-black uppercase tracking-[0.2em] text-accent"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          Impact Breakdown
                        </div>
                        {signal.commodityImpacts.map((c) => (
                          <div
                            key={c.asset}
                            className="flex items-center gap-3 p-3 rounded-lg bg-surface/20 border"
                            style={{ borderColor: "var(--border-subtle)" }}
                          >
                            <CommodityChip asset={c.asset} direction={c.direction} confidence={c.confidence} />
                            <p className="text-xs text-text-secondary">
                              {c.asset} — {c.direction} — flagged from this{" "}
                              {eventTypeLabel(signal.eventType).toLowerCase()} signal in{" "}
                              {formatRegionLabel(signal.region)}.
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-4 space-y-6">
                    <div
                      className="p-6 rounded-lg bg-surface/40 border"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <h5
                        className="text-[10px] font-black uppercase tracking-widest text-text-primary mb-4"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        Verification
                      </h5>
                      <p className="text-xs font-mono text-text-secondary">
                        Confirmed by {signal.sourcesCount} source{signal.sourcesCount === 1 ? "" : "s"}.
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── HISTORICAL TAB ───────────────────────────────── */}
              <TabsContent value="historical" className="m-0 outline-none">
                {historicalComparisons.length >= 2 ? (
                  <div className="space-y-3">
                    {historicalComparisons.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => router.push(`/events/${h.id}`)}
                        className="w-full text-left p-4 rounded-lg bg-surface/20 border border-border flex justify-between items-center group hover:bg-surface/40 transition-all"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-bold text-text-primary">{h.title}</span>
                          <span className="text-[9px] font-mono text-muted uppercase">
                            {h.country} · {h.eventDate ? safeFormatDistanceToNow(h.eventDate, { addSuffix: true }) : "unknown date"} · Severity {h.severity}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {h.commodityImpacts.slice(0, 2).map((c) => (
                            <CommodityChip key={c.asset} asset={c.asset} direction={c.direction} confidence={c.confidence} />
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="max-w-2xl p-20 rounded-lg border-2 border-dashed border-border/40 flex flex-col items-center justify-center text-center">
                    <Database className="w-12 h-12 text-muted mb-6" />
                    <h3 className="text-sm font-black uppercase tracking-[0.3em] text-text-primary mb-2">
                      Not Enough Historical Data Yet
                    </h3>
                    <p className="text-[10px] font-bold text-muted uppercase tracking-widest leading-relaxed">
                      Comparisons for this event type will appear as more signals are recorded.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* ── MAP TAB ──────────────────────────────────────── */}
              <TabsContent value="map" className="m-0 outline-none">
                <div
                  className="aspect-video w-full rounded-lg border overflow-hidden relative"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <EventLocationMap lng={mapLng} lat={mapLat} zoom={hasPreciseLocation ? 6 : 3} />
                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 backdrop-blur-sm">
                    <span className="text-[9px] font-mono text-muted uppercase">
                      {hasPreciseLocation
                        ? "Precise coordinates"
                        : "Approximate location — precise coordinates unavailable for this event"}
                    </span>
                  </div>
                </div>
              </TabsContent>

              {/* ── SOURCES TAB ──────────────────────────────────── */}
              <TabsContent value="sources" className="m-0 outline-none">
                {sources.length > 0 ? (
                  <div className="space-y-3">
                    {sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-4 rounded-lg bg-surface/20 border border-border flex justify-between items-center group hover:bg-surface/40 cursor-pointer transition-all"
                      >
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black uppercase tracking-widest text-text-primary">
                            {s.title}
                          </span>
                          <span className="text-[9px] font-mono text-muted uppercase">
                            {s.sourceLabel ?? "Unknown source"}
                            {s.publishedAt ? ` · ${safeFormatDistanceToNow(s.publishedAt, { addSuffix: true })}` : ""}
                          </span>
                        </div>
                        <ExternalLink
                          className="text-muted group-hover:text-accent transition-colors"
                          size={16}
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="max-w-2xl p-20 rounded-lg border-2 border-dashed border-border/40 flex flex-col items-center justify-center text-center">
                    <Database className="w-12 h-12 text-muted mb-6" />
                    <p className="text-[10px] font-bold text-muted uppercase tracking-widest leading-relaxed">
                      No source articles are linked to this signal.
                    </p>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
      {alertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            onClick={() => setAlertModalOpen(false)}
          />
          <div className="relative bg-[#131313] border border-[#3c4a42] rounded-lg p-6 w-full max-w-md z-50 text-white space-y-4">
            <h3 className="text-lg font-bold text-[#4edea3]">
              Configure Sentinel Alert Threshold
            </h3>

            <div>
              <label className="text-[10px] uppercase font-bold text-[#86948a] block mb-1">
                Target Region
              </label>
              <input
                value={modalRegion}
                onChange={(e) => setModalRegion(e.target.value as any)}
                className="w-full bg-[#0e0e0e] border border-[#3c4a42] p-2 text-xs text-white rounded font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-[#86948a] block mb-1">
                Min Severity Threshold (1-10)
              </label>
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
                onClick={() => createAlertRule()}
                className="px-6 py-2 bg-[#4edea3] text-[#003824] text-xs font-bold uppercase rounded hover:bg-[#6ffbbe] transition-all"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
