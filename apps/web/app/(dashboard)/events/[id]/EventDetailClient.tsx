"use client";

import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";
import {
  Share2,
  Bookmark,
  Target,
  Zap,
  ExternalLink,
  Database,
} from "lucide-react";

import { CommodityChip } from "@/components/signals/CommodityChip";
import { MarketImpactAssessment } from "@/components/signals/MarketImpactAssessment";
import { SignalChatPanel } from "@/components/signals/SignalChatPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RECORD_BUTTON_TOOLTIP } from "@/lib/feature-hints";
import { FOREX_PAIRS } from "@blue-beacon-research/shared";
import type { EventDetailResponse } from "@/app/api/signals/[id]/route";
import { RELATED_EVENTS_PAGE_SIZE } from "@/lib/related-events";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { AUTH_SESSION_ERROR, safeMutationError, throwIfNoSupabase } from "@/lib/user-error-copy";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUIStore } from "@/store/useUIStore";
import { generateAlertRuleName, formatRegionLabel, safeFormatDistanceToNow } from "@/lib/utils";
import { getSignalCoordinates } from "@/lib/geo-coords";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { logFunnelEventOnce, logUsageEvent } from "@/lib/funnel-events";
import { deferToIdle } from "@/lib/idle-defer";
import {
  eventAlertCta,
  emptyBriefingCopy,
} from "@/lib/signal-display";
import { eventDetailNotice } from "@/lib/event-detail-fetch";

// The "rest" of the event detail page — everything that needs the heavier
// GET /api/signals/[id] payload (market impact, related events, historical
// comparisons, price-at-signal, chat, outcomes) rather than just the signal
// row. Rendered inside the <Suspense> boundary in page.tsx via
// EventDetailRest.tsx's server-side call into that same route handler — no
// client-side fetch of the main payload happens here anymore (2026-11-09).
// The page used to fetch that payload with react-query after mount.
//
// EventLocationMap pulls in maplibre-gl's CSS at module scope, which both (a)
// is unrelated to the page's critical content and (b) makes this component
// impossible to import in the plain node/tsx render-test harness (see
// page.test.tsx's long-standing note). next/dynamic with ssr:false defers
// that import to the Map tab actually being used, which fixes both.
const EventLocationMap = dynamic(
  () => import("@/components/signals/EventLocationMap").then((m) => m.EventLocationMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full" />,
  },
);

function eventTypeLabel(eventType?: string | null): string {
  if (!eventType) return "this event";
  return eventType
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function EventDetailClient({ data }: { data: EventDetailResponse }) {
  const router = useRouter();
  const { user } = useAuth();
  const signal = data.signal;
  const incrementSignalsViewed = useUIStore((s) => s.incrementSignalsViewed);

  useEffect(() => {
    incrementSignalsViewed();
  }, [signal.id, incrementSignalsViewed]);

  const notice = eventDetailNotice(null, data.degraded ?? []);

  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [modalRegion, setModalRegion] = useState<string>(signal.region || "middle-east");
  const [modalMinSeverity, setModalMinSeverity] = useState(Math.max(1, (signal.severity || 7) - 1));
  const [modalChannels, setModalChannels] = useState<string[]>(["telegram"]);
  const [modalForexPairs, setModalForexPairs] = useState<string[]>([]);
  // How many of the already-fetched, already-scored Related Events to render —
  // "Load more" reveals further pages of the same in-hand array rather than a
  // second round trip (see RELATED_EVENTS_PAGE_SIZE in the signals/[id] route).
  const [visibleRelatedCount, setVisibleRelatedCount] = useState(RELATED_EVENTS_PAGE_SIZE);

  // Reset the "Load more" reveal count when navigating from one event to
  // another (same guard the old client-fetching version of this page had) —
  // otherwise a soft client-side nav to a different signal.id could keep
  // this component instance (and its state) alive with a new `data` prop.
  useEffect(() => {
    setVisibleRelatedCount(RELATED_EVENTS_PAGE_SIZE);
  }, [signal.id]);

  // Minimum funnel step: "first signal viewed" — PostHog computes first-occurrence
  // itself from this event, no client-side "is this the first" tracking needed.
  useEffect(() => {
    track("signal_viewed", { signalId: signal.id, severity: signal.severity });
  }, [signal.id, signal.severity]);

  // first_signal_viewed / signal_detail_opened are POST /api/events calls.
  // They wait for an idle callback so they do not start with the signal row.
  // 2026-11-09. The calls themselves are unchanged.
  useEffect(
    () =>
      deferToIdle(() => {
        logFunnelEventOnce("first_signal_viewed", { signalId: signal.id });
      }),
    [signal.id],
  );
  useEffect(
    () =>
      deferToIdle(() => {
        logUsageEvent("signal_detail_opened", { signalId: signal.id }, "entity");
      }),
    [signal.id],
  );

  const sources = data.sources ?? [];
  const historicalComparisons = data.historicalComparisons ?? [];
  const relatedEventsAll = data.relatedEvents ?? [];
  const relatedEventsTotal = data.relatedEventsTotal ?? relatedEventsAll.length;
  const relatedEvents = relatedEventsAll.slice(0, visibleRelatedCount);
  const relatedEventsHasMore = visibleRelatedCount < relatedEventsAll.length;
  const pricesAtSignal = data.pricesAtSignal ?? [];
  const marketImpactMagnitudes = data.marketImpactMagnitudes ?? {};
  const ownOutcomes = data.ownOutcomes ?? {};
  const alertCta = eventAlertCta(signal.severity);

  const hasPreciseLocation =
    typeof signal.lat === "number" &&
    typeof signal.lng === "number" &&
    (signal.lat !== 0 || signal.lng !== 0);
  const [mapLng, mapLat] = getSignalCoordinates(signal);

  const createAlertRule = async () => {
    try {
      const supabase = throwIfNoSupabase(getSupabaseBrowserClient());
      if (!user) throw new Error(AUTH_SESSION_ERROR);

      if (modalMinSeverity < 1 || modalMinSeverity > 10) {
        throw new Error("Severity must be between 1 and 10");
      }

      const { error } = await supabase.from("alert_rules").insert({
        user_id: user.id,
        name: generateAlertRuleName(modalRegion, modalMinSeverity, signal.eventType),
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
      track("alert_rule_created", { source: "event_detail", region: modalRegion, minSeverity: modalMinSeverity });
      logFunnelEventOnce("first_alert_rule_created", { source: "event_detail" });
      logUsageEvent("alert_rule_created", { source: "event_detail" }, false);
      toast.success("Alert Rule Activated", {
        description: `Alerts set for ${modalRegion} (Severity >= ${modalMinSeverity})`,
      });
      setAlertModalOpen(false);
    } catch (err: any) {
      toast.error(safeMutationError(err, "Failed to create alert rule"));
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
    <div className="contents">
      <div className="w-full space-y-4 xl:col-start-2 xl:row-start-1">
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

          <MarketImpactAssessment
            signal={signal}
            pricesAtSignal={pricesAtSignal}
            showPriceSubtext
            headingIcon={<Target size={14} className="text-accent" />}
            marketImpactMagnitudes={marketImpactMagnitudes}
            ownOutcomes={ownOutcomes}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Button
            data-tour="set-alert"
            data-testid="event-alert-cta"
            onClick={() => {
              setModalForexPairs([]);
              setAlertModalOpen(true);
            }}
            className={
              alertCta.variant === "severe"
                ? "h-11 bg-accent text-bg-app text-[12px] md:text-[11px] font-black uppercase tracking-widest rounded-sm shadow-[0_4px_15px_rgba(78,222,163,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                : "h-11 border border-border bg-transparent text-text-secondary text-[12px] md:text-[11px] font-black uppercase tracking-widest rounded-sm hover:bg-surface/40 transition-all"
            }
            variant={alertCta.variant === "severe" ? "default" : "outline"}
          >
            <Zap size={14} className="mr-2" /> {alertCta.label}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleShare}
              variant="outline"
              className="h-11 border-border text-[12px] md:text-[11px] font-black uppercase tracking-widest rounded-sm"
            >
              <Share2 size={14} className="mr-2" /> SHARE
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    id="bbr-hint-event-record"
                    data-hint="event_record"
                    data-testid="event-record"
                    onClick={handleRecord}
                    variant="outline"
                    className="h-11 border-border text-[12px] md:text-[11px] font-black uppercase tracking-widest rounded-sm"
                  />
                }
              >
                <Bookmark size={14} className="mr-2" /> RECORD
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-left">
                {RECORD_BUTTON_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="min-w-0 xl:col-start-1 xl:row-start-2">
      {notice.degradedLine ? (
        <p className="mb-6 text-sm text-muted" data-testid="event-detail-degraded">
          {notice.degradedLine}{" "}
          <button type="button" className="underline" onClick={() => router.refresh()}>
            Retry
          </button>
        </p>
      ) : null}

      {/* ── Deep Dive Analysis ─────────────────────────────────── */}
      <Tabs defaultValue="analysis" className="w-full">
        {/* overflow-x-auto + shrink-0 on each trigger: at 360px this row's
            intrinsic content width (tabs × padding/tracking + gaps) exceeds
            the viewport and was silently clipping the last tab out of reach
            entirely rather than causing scroll — found live, not from a
            Stitch mock. Horizontal scroll is the standard mobile pattern for
            a tab row that doesn't fit; desktop has ample room so it never
            triggers there. */}
        <TabsList
          className="bg-surface/30 border-b w-full justify-start rounded-none h-auto p-0 gap-4 md:gap-8 overflow-x-auto flex-nowrap"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          {/* "sources" tab value kept as-is (not renamed to "timeline") so any
              existing deep links / analytics keyed to this tab value keep working
              — only the visible label changed, now that the underlying data is a
              real oldest-first timeline (raw_events ordered by publish time). */}
          {[
            { value: "analysis", label: "analysis" },
            { value: "historical", label: "historical" },
            { value: "map", label: "map" },
            { value: "sources", label: "timeline" },
            { value: "related", label: "related events" },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="shrink-0 bg-transparent border-0 border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:text-accent rounded-none px-2 py-4 text-[12px] md:text-[11px] font-black uppercase tracking-[0.3em] text-muted transition-all"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="py-8">
          {/* ── ANALYSIS TAB ─────────────────────────────────── */}
          <TabsContent value="analysis" className="m-0 outline-none">
            <div className="space-y-8">
              <div>
                <div
                  className="text-[12px] md:text-[11px] font-black uppercase tracking-[0.2em] text-accent mb-4"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Full Analyst Briefing
                </div>
                {signal.aiAnalysis ? (
                  <div className="text-base text-text-secondary leading-relaxed [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_p+p]:mt-4">
                    <ReactMarkdown allowedElements={["p", "strong", "em", "ul", "ol", "li"]} unwrapDisallowed>
                      {signal.aiAnalysis}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div
                    className="p-8 rounded-lg bg-surface/20 border border-dashed text-center"
                    style={{ borderColor: "var(--border-subtle)" }}
                    data-testid="full-analyst-briefing-empty"
                  >
                    <p className="text-sm leading-relaxed text-text-secondary">
                      {emptyBriefingCopy(signal.severity).text}
                    </p>
                  </div>
                )}
              </div>

              {signal.materialityReasoning ? (
                <details data-testid="why-this-signal" className="group">
                  <summary
                    className="mb-4 cursor-pointer text-[12px] md:text-[11px] font-black uppercase tracking-[0.2em] text-accent"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    Why this signal
                  </summary>
                  <p className="text-base leading-relaxed text-text-secondary">{signal.materialityReasoning}</p>
                </details>
              ) : null}

              {signal.invalidationCondition ? (
                <div data-testid="invalidation-condition">
                  <div
                    className="text-[12px] md:text-[11px] font-black uppercase tracking-[0.2em] text-accent mb-4"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    What would change this assessment
                  </div>
                  <p className="text-base leading-relaxed text-text-secondary">{signal.invalidationCondition}</p>
                </div>
              ) : null}

              {signal.commodityImpacts.length > 0 && (
                <div className="space-y-3">
                  <div
                    className="text-[12px] md:text-[11px] font-black uppercase tracking-[0.2em] text-accent"
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

              {/* #111 (frontend half) — chat panel, below the existing
                 Full Analyst Briefing / Impact Breakdown sections above.
                 Does not touch or restyle those sections. */}
              <SignalChatPanel signalId={signal.id} classificationMethod={signal.classificationMethod} />
            </div>
          </TabsContent>

          {/* ── HISTORICAL TAB ───────────────────────────────── */}
          <TabsContent value="historical" className="m-0 outline-none">
            {historicalComparisons.length >= 2 ? (
              <div className="space-y-3">
                {historicalComparisons.map((h) => (
                  <a
                    key={h.id}
                    href={`/events/${h.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full text-left p-4 rounded-lg bg-surface/20 border border-border flex justify-between items-center group hover:bg-surface/40 transition-all"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-text-primary">{h.title}</span>
                      <span className="text-[12px] md:text-[11px] font-mono text-muted uppercase">
                        {h.country} · {h.eventDate ? safeFormatDistanceToNow(h.eventDate, { addSuffix: true }) : "unknown date"} · Severity {h.severity}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {h.commodityImpacts.slice(0, 2).map((c) => (
                        <CommodityChip key={c.asset} asset={c.asset} direction={c.direction} confidence={c.confidence} />
                      ))}
                    </div>
                  </a>
                ))}
              </div>
            ) : notice.hideHistorical ? null : (
              <div className="max-w-2xl p-20 rounded-lg border-2 border-dashed border-border/40 flex flex-col items-center justify-center text-center">
                <Database className="w-12 h-12 text-muted mb-6" />
                <h3 className="text-sm font-black uppercase tracking-[0.3em] text-text-primary mb-2">
                  Not Enough Historical Data Yet
                </h3>
                <p className="text-[12px] md:text-[11px] font-bold text-muted uppercase tracking-widest leading-relaxed">
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
                <span className="text-[12px] md:text-[11px] font-mono text-muted uppercase">
                  {hasPreciseLocation
                    ? "Precise coordinates"
                    : "Approximate location — precise coordinates unavailable for this event"}
                </span>
              </div>
            </div>
          </TabsContent>

          {/* ── SOURCES TAB ──────────────────────────────────── */}
          <TabsContent value="sources" className="m-0 outline-none">
            <p className="text-[12px] md:text-[11px] font-mono text-muted uppercase tracking-widest mb-2">
              Signals list the named sources they were built from, linking out where the publisher's URL is available, and are tagged with a claim-status label — official statement, reported claim, or speculative/unconfirmed — where that label is available.
            </p>
            <p className="text-[12px] md:text-[11px] font-mono text-muted uppercase tracking-widest mb-4">
              As a general practice, events are screened for real market relevance before they are published as a signal.
            </p>
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
                      <span className="text-[12px] md:text-[11px] font-black uppercase tracking-widest text-text-primary">
                        {s.title}
                      </span>
                      <span className="text-[12px] md:text-[11px] font-mono text-muted uppercase">
                        {s.domain ?? s.sourceLabel ?? "Unknown source"}
                        {s.publishedAt ? ` · ${safeFormatDistanceToNow(s.publishedAt, { addSuffix: true })}` : ""}
                      </span>
                    </div>
                    <ExternalLink className="text-muted group-hover:text-accent transition-colors" size={16} />
                  </a>
                ))}
              </div>
            ) : (
              <div className="max-w-2xl p-20 rounded-lg border-2 border-dashed border-border/40 flex flex-col items-center justify-center text-center">
                <Database className="w-12 h-12 text-muted mb-6" />
                <p className="text-[12px] md:text-[11px] font-bold text-muted uppercase tracking-widest leading-relaxed">
                  No source articles are linked to this signal.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── RELATED EVENTS TAB ───────────────────────────────── */}
          <TabsContent value="related" className="m-0 outline-none">
            {relatedEventsAll.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[12px] md:text-[11px] font-mono text-muted uppercase tracking-widest">
                  Showing {relatedEvents.length} of {relatedEventsTotal}
                </p>
                {relatedEvents.map((r) => (
                  <a
                    key={r.id}
                    href={`/events/${r.id}`}
                    className="w-full text-left p-4 rounded-lg bg-surface/20 border border-border flex justify-between items-center group hover:bg-surface/40 transition-all"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-text-primary">{r.title}</span>
                      <span className="text-[12px] md:text-[11px] font-mono text-muted uppercase">
                        {r.country ?? "Unknown"} · {r.eventDate ? safeFormatDistanceToNow(r.eventDate, { addSuffix: true }) : "unknown date"} ·{" "}
                        {r.sharedCommodities.join(", ")}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-1 rounded-sm text-[12px] md:text-[11px] font-black uppercase tracking-widest border ${
                        r.matchLabel === "reinforcing"
                          ? "text-accent border-accent/30 bg-accent/10"
                          : r.matchLabel === "conflicting"
                            ? "text-red-400 border-red-400/30 bg-red-400/10"
                            : "text-muted border-border bg-surface/40"
                      }`}
                    >
                      {r.matchLabel}
                    </span>
                  </a>
                ))}
                <LoadMoreButton
                  hasMore={relatedEventsHasMore}
                  isLoading={false}
                  onClick={() => setVisibleRelatedCount((n) => n + RELATED_EVENTS_PAGE_SIZE)}
                  loadedCount={relatedEvents.length}
                  totalCount={relatedEventsTotal}
                  endLabel="End of related events"
                />
              </div>
            ) : notice.hideRelated ? null : (
              <div className="max-w-2xl p-20 rounded-lg border-2 border-dashed border-border/40 flex flex-col items-center justify-center text-center">
                <Database className="w-12 h-12 text-muted mb-6" />
                <p className="text-[12px] md:text-[11px] font-bold text-muted uppercase tracking-widest leading-relaxed">
                  No related events found.
                </p>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
      </div>

      {alertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            onClick={() => setAlertModalOpen(false)}
          />
          <div className="relative bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-6 w-full max-w-md z-50 text-white space-y-4">
            <h3 className="text-lg font-bold text-[var(--accent)]">Configure Alert Threshold</h3>

            <div>
              <label className="text-[12px] md:text-[11px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Target Region
              </label>
              <input
                value={modalRegion}
                onChange={(e) => setModalRegion(e.target.value as any)}
                className="w-full bg-[#0e0e0e] border border-[var(--border)] p-2 text-xs text-white rounded font-mono"
              />
            </div>

            <div>
              <label className="text-[12px] md:text-[11px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Min Severity Threshold (1-10)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={modalMinSeverity}
                onChange={(e) => setModalMinSeverity(Number(e.target.value))}
                className="w-full bg-[#0e0e0e] border border-[var(--border)] p-2 text-xs text-white rounded font-mono"
              />
            </div>

            <div>
              <label className="text-[12px] md:text-[11px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Forex Pairs (optional)
              </label>
              <p className="text-[12px] md:text-[11px] text-[#6b7674] mb-2">
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
                          prev.includes(f.symbol) ? prev.filter((s) => s !== f.symbol) : [...prev, f.symbol],
                        )
                      }
                      className={`px-2.5 py-1 text-[12px] md:text-[11px] font-mono font-bold rounded border transition-colors cursor-pointer ${
                        active
                          ? "bg-[var(--accent)] text-[#003824] border-[var(--accent)]"
                          : "bg-[#0e0e0e] text-[var(--text-muted)] border-[var(--border)] hover:text-white"
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
                className="px-4 py-2 text-xs font-bold text-[var(--text-muted)] hover:text-white uppercase"
              >
                Cancel
              </button>
              <button
                onClick={() => createAlertRule()}
                className="px-6 py-2 bg-[var(--accent)] text-[#003824] text-xs font-bold uppercase rounded hover:bg-[#6ffbbe] transition-all"
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
