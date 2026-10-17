"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSignalFeed } from "@/hooks/useSignalFeed";
import { useMyPreferences } from "@/hooks/useMyPreferences";
import { useUIStore } from "@/store/useUIStore";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { FilterBar } from "@/components/signals/FilterBar";
import { CategoryChips } from "@/components/signals/CategoryChips";
import { SignalTable } from "@/components/signals/SignalTable";
import { SignalQuickView } from "@/components/signals/SignalQuickView";
import { FreshTag } from "@/components/signals/FreshTag";
import { MediaImpactTag } from "@/components/signals/MediaImpactTag";
import { SeverityBadge } from "@/components/signals/SeverityBadge";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { feedDegradedCopy } from "@/lib/user-error-copy";
import { sourceConfirmationLabel } from "@/lib/market-impact-assessment";
import { safeFormatDistanceToNow, formatDataAsOf } from "@/lib/utils";
import { fetchMyProfile } from "@/lib/profile";
import { signalsToCsv, downloadCsv } from "@/lib/signal-csv";
import { priceChangeParts, priceChangeColor } from "@/lib/price-change";
import { countryToFlagEmoji } from "@/lib/country-flags";
import { logUsageEvent, signalEventMetadata } from "@/lib/funnel-events";
import {
  DEFAULT_FILTERS,
  DESK_PRESETS,
  deskMatchesFilters,
  type DeskPresetId,
  type FilterBarValue,
} from "@/lib/signal-filters";
import type { Signal } from "@blue-beacon-research/shared";
import { DASHBOARD_FEED_SUBHEAD } from "@/lib/ingestion-interval";
import { fetchJsonWithTimeout } from "@/lib/fetch-with-timeout";
import { SlowDataNotice } from "@/components/SlowDataNotice";
import { SinceLastVisit } from "@/components/desk/SinceLastVisit";
import { MarketsLedger } from "@/components/desk/MarketsLedger";
import { StoryThreadCard } from "@/components/desk/StoryThreadCard";
import { useMarketsLedger } from "@/components/desk/useMarketsLedger";
import { groupStoryThreads, type FeedItem } from "@/lib/story-threads";
import { biggestMover, resolveLedgerSymbols, LEDGER_WATCHLIST_STORAGE_KEY } from "@/lib/desk-ledger";

// Same shape/lookup already used by PriceTicker and the watchlist pages — reusing
// the existing /api/prices 24h-change calculation here rather than adding a new one.
type LatestPrice = {
  symbol: string;
  change_pct_24h?: number;
  changePct24h?: number;
};

/** The signal's primary asset (commodity first, then forex pair) matched against the
 * latest-prices lookup. Null when no asset can be confidently associated, or the
 * matched price row has no 24h-change figure (never fabricated as 0.0%). */
export function signalPriceMovePct(signal: Signal, prices: LatestPrice[]): { asset: string; pct: number } | null {
  const asset = signal.commodityImpacts?.[0]?.asset ?? signal.currencyPairImpacts?.[0]?.asset;
  if (!asset) return null;
  const price = prices.find((p) => p.symbol === asset);
  if (!price) return null;
  const pct = price.change_pct_24h ?? price.changePct24h;
  if (pct == null) return null;
  return { asset, pct };
}

export function SignalRowPriceChip({ signal, prices }: { signal: Signal; prices: LatestPrice[] }) {
  const move = signalPriceMovePct(signal, prices);
  if (!move) {
    return (
      <span
        className="text-[12px] md:text-[11px] shrink-0"
        style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Sans', sans-serif" }}
        aria-label="No associated price data"
      >
        —
      </span>
    );
  }
  const change = priceChangeParts(move.pct);
  return (
    <span
      className="text-[12px] md:text-[11px] shrink-0"
      style={{
        color: priceChangeColor(change.direction),
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      {move.asset} 24h {change.text}
    </span>
  );
}

export default function DashboardPage() {
  // "My Feed" (#81) — opt-in narrowing to the commodities/regions the user follows.
  // Default OFF: existing users see the exact same full feed until they turn it on.
  const [personalized, setPersonalized] = useState(false);
  const [filters, setFilters] = useState<FilterBarValue>(DEFAULT_FILTERS);
  // Cards | Table view toggle (4.1) — remembered per-browser. Reads lazily so
  // the very first render already matches a returning user's last choice
  // (no layout flash); wrapped in try/catch, as localStorage can throw (private
  // mode, blocked storage) or simply not exist — defaults to "cards" either way.
  const [feedViewMode, setFeedViewMode] = useState<"cards" | "table">(() => {
    if (typeof window === "undefined") return "cards";
    try {
      const stored = window.localStorage.getItem("bbr_feed_view_mode");
      return stored === "table" ? "table" : "cards";
    } catch {
      return "cards";
    }
  });
  const setFeedViewModePersisted = (mode: "cards" | "table") => {
    setFeedViewMode(mode);
    try {
      window.localStorage.setItem("bbr_feed_view_mode", mode);
    } catch {
      // ignore — view toggle still works for this session, just not remembered
    }
  };
  const [hideSummaries, setHideSummaries] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("bbr.feed.hideSummaries") === "true";
    } catch {
      return false;
    }
  });
  const setHideSummariesPersisted = (next: boolean) => {
    setHideSummaries(next);
    try {
      window.localStorage.setItem("bbr.feed.hideSummaries", next ? "true" : "false");
    } catch {
      // ignore — toggle still works for this session, just not remembered
    }
  };
  // "Group related reports" (default on). Remembered per browser; the flat list is one click away.
  const [groupRelated, setGroupRelated] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("bbr.feed.groupRelated") !== "false";
    } catch {
      return true;
    }
  });
  const setGroupRelatedPersisted = (next: boolean) => {
    setGroupRelated(next);
    try {
      window.localStorage.setItem("bbr.feed.groupRelated", next ? "true" : "false");
    } catch {
      // ignore — toggle still works for this session, just not remembered
    }
  };
  const { data: myPrefs, isFetched: prefsFetched } = useMyPreferences();
  const [storedWatch, setStoredWatch] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LEDGER_WATCHLIST_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as { symbols?: unknown }) : null;
      if (parsed && Array.isArray(parsed.symbols)) {
        setStoredWatch(parsed.symbols.filter((x): x is string => typeof x === "string"));
      }
    } catch {
      // storage unavailable — fall back to the default tracked list
    }
  }, []);
  const {
    liveSignals,
    justIn,
    resolvedWindow,
    oldestEventDate,
    isLoading,
    isError,
    degraded,
    refetch,
    fallback,
    fallbackReason,
    fallbackLastUpdated,
    total,
    personalizedApplied,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
    dataUpdatedAt,
  } = useSignalFeed({
    enabled: true,
    personalized,
    commodity: filters.commodity,
    region: filters.region,
    minSeverity: filters.minSeverity,
    window: filters.window,
    minSources: filters.minSources,
    eventCategory: filters.eventCategory,
  });
  const { tourActive, tourPhase, startTour, setTourEventId } = useUIStore();

  // Per-row price-impact chip (dashboard-only addition) — reuses the same
  // /api/prices 24h-change endpoint PriceTicker/watchlist already fetch.
  const { data: pricesData } = useQuery({
    queryKey: ["prices"],
    queryFn: () => fetchJsonWithTimeout<{ prices: LatestPrice[] }>("/api/prices"),
    refetchInterval: 60_000,
  });
  const latestPrices = pricesData?.prices ?? [];

  // Markets ledger: only symbols already on the user's watchlist (server list,
  // then the local cache, then the default list), so no extra symbols are fetched.
  const ledgerSymbols = useMemo(
    () => resolveLedgerSymbols(myPrefs?.watchlistSymbols, storedWatch),
    [myPrefs?.watchlistSymbols, storedWatch],
  );
  const ledger = useMarketsLedger(ledgerSymbols, prefsFetched);
  const mover = useMemo(() => biggestMover(ledger.rows), [ledger.rows]);

  const showMyFeedToggle = Boolean(myPrefs?.hasPreferences);
  const [quickViewSignal, setQuickViewSignal] = useState<Signal | null>(null);
  const [coverageLine, setCoverageLine] = useState<string | null>(null);
  const [coverageFailed, setCoverageFailed] = useState(false);
  const [coverageRetry, setCoverageRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCoverageFailed(false);
    fetchJsonWithTimeout<{ sourcesLast24h?: number }>("/api/signals/source-stats")
      .then((d) => {
        if (cancelled || !d) return;
        if (typeof d.sourcesLast24h !== "number") return;
        setCoverageLine(`Last 24h: signals from ${d.sourcesLast24h} sources.`);
      })
      .catch(() => {
        if (!cancelled) setCoverageFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [coverageRetry]);

  const applyDesk = (id: DeskPresetId) => {
    const preset = DESK_PRESETS[id];
    setFilters((prev) => ({
      ...prev,
      commodity: preset.commodity,
      region: preset.region,
    }));
  };

  const handleFiltersChange = (next: FilterBarValue) => {
    setFilters(next);
  };

  // #CSV export — client-side from the currently loaded, currently filtered
  // feed. Free for every user, no plan gate (founder decision 2026-09-30).
  const handleExportCsv = () => {
    const csv = signalsToCsv(liveSignals);
    downloadCsv(`blue-beacon-signals-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  // Compute top hotzones from liveSignals
  const topHotzones = useMemo(() => {
    const map = new Map<string, { count: number; totalSeverity: number }>();
    for (const s of liveSignals) {
      const region = (s.region || s.country || "Global").toUpperCase();
      const entry = map.get(region) ?? { count: 0, totalSeverity: 0 };
      entry.count += 1;
      entry.totalSeverity += s.severity ?? 0;
      map.set(region, entry);
    }
    const arr = Array.from(map.entries()).map(([region, v]) => ({
      region,
      count: v.count,
      avgSeverity: v.totalSeverity / v.count,
    }));
    arr.sort((a, b) => b.count - a.count || b.avgSeverity - a.avgSeverity);
    return arr.slice(0, 3);
  }, [liveSignals]);

  // Honest widened-window banner: the tiered default fallback in
  // apps/web/app/api/signals/route.ts can silently widen 24h → 72h → 7d when
  // there aren't enough signals to fill the feed. `resolvedWindow` is only
  // present on that default (no explicit window filter) path, so this never
  // fires when the user picked a window themselves. Never hide the widening —
  // that's exactly the invisible-window mistake `is_active` made previously.
  const windowExpandedLine =
    resolvedWindow === "72h"
      ? "Showing signals from the last 3 days — live coverage is still expanding."
      : resolvedWindow === "7d"
        ? "Showing signals from the last 7 days — live coverage is still expanding."
        : null;

  // Featured pick: freshest-first (justIn[0]) when the default tiered view
  // resolved a `justIn` zone, falling back to the top of the blended list
  // otherwise (explicit window filters, or a candidate set too small to have
  // a justIn split at all). Replaces the old `severity >= 8` hunt — that rule
  // assumed the feed was always hard-bounded to 24h, which stopped being true
  // once the window can widen to 72h/7d; a month-old severity-8 could
  // otherwise resurface as "featured" ahead of anything actually new.
  // `justIn[0]` is both the single freshest signal AND, by construction,
  // already near the top of the recency+severity blend, so this doesn't trade
  // relevance for recency — see docs/brain/15_INGESTION_PIPELINE.md §5.4.
  // Story threads are grouped from every loaded page at once; grouping the whole
  // loaded list gives the same result as grouping each page and merging by the same rule.
  const feedItems = useMemo<FeedItem<Signal>[]>(() => groupStoryThreads(liveSignals), [liveSignals]);
  const threadCount = useMemo(() => feedItems.filter((i) => i.kind === "thread").length, [feedItems]);
  const streamItems: FeedItem<Signal>[] = groupRelated
    ? feedItems
    : liveSignals.map((signal) => ({ kind: "single" as const, signal }));
  // Lead story: the first thread's lead, else the highest-severity item from the
  // last 24 hours, else the previous pick.
  const leadSignal = useMemo<Signal | undefined>(() => {
    const firstThread = feedItems.find((i) => i.kind === "thread");
    if (firstThread && firstThread.kind === "thread") return firstThread.thread.lead;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let best: Signal | undefined;
    for (const s of liveSignals) {
      const t = Date.parse(s.createdAt);
      if (!Number.isFinite(t) || t < cutoff) continue;
      if (!best || s.severity > best.severity) best = s;
    }
    return best;
  }, [feedItems, liveSignals]);
  const featured = leadSignal ?? (justIn.length > 0 ? justIn[0] : liveSignals[0]);
  const leadThread = useMemo(() => {
    for (const i of feedItems) {
      if (i.kind === "thread" && featured && i.thread.members.some((m) => m.id === featured.id)) {
        return i.thread;
      }
    }
    return null;
  }, [feedItems, featured]);
  const secondaryPool = liveSignals.filter((s) => s.id !== featured?.id);
  const secondaryA = secondaryPool[0];
  const secondaryB = secondaryPool[1];
  // Real infinite scroll now (sentinelRef, below) — every loaded signal
  // renders, rather than being held back behind a client-side reveal batch.
  const streamList = liveSignals;

  const filtersActive =
    filters.commodity != null ||
    filters.region != null ||
    filters.minSeverity > DEFAULT_FILTERS.minSeverity ||
    filters.window != null ||
    filters.minSources > DEFAULT_FILTERS.minSources ||
    filters.eventCategory != null;
  const canLoadMoreStream = hasNextPage;
  // Manual fallback for the "Load more" button — the sentinel div below
  // triggers the same fetchNextPage automatically as the user scrolls near it.
  const handleLoadMoreStream = () => {
    void fetchNextPage();
  };
  // Once pagination genuinely exhausts the full is_active+severity set
  // (oldestEventDate only arrives then — see useSignalFeed), say so
  // honestly instead of implying there's no more news. Only for the
  // unfiltered default view: an explicit filter (window/region/commodity/
  // severity) running out of matches is a real "no more results for this
  // filter", not the same claim.
  const streamEndLabel =
    !filtersActive && oldestEventDate
      ? `You've reached the earliest signal on record (${new Date(
          oldestEventDate,
        ).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })})`
      : "End of signal stream";

  // First-time tour: only fires once real signal data (and a featured card
  // to anchor steps 2-4 to) has actually loaded, and only for users who
  // haven't completed it — checked server-side via profiles so it doesn't
  // reappear across devices/cleared cookies. Checked once per mount via a
  // ref (not a `tourActive` dependency) — otherwise skipping/finishing the
  // tour flips tourActive back to false, which would re-run this effect and
  // race the async completion write, restarting the tour it just ended.
  const hasCheckedTourRef = useRef(false);
  useEffect(() => {
    if (hasCheckedTourRef.current || isLoading || !featured || tourActive) return;
    hasCheckedTourRef.current = true;
    let cancelled = false;
    (async () => {
      const profile = await fetchMyProfile();
      if (cancelled || !profile || profile.productTourCompleted) return;
      setTourEventId(featured.id);
      startTour();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, featured?.id]);

  // dashboard_viewed — recurring usage event (once per page-session), feeds
  // DAU/WAU and 7-day usage counts on /admin/metrics.
  useEffect(() => {
    logUsageEvent("dashboard_viewed");
  }, []);

  // Keep the tour's target event id in sync with the featured card while
  // the welcome or dashboard phase of the tour is active (covers both first-run and
  // "Replay product tour" from the Help modal).
  useEffect(() => {
    if (tourActive && (tourPhase === "welcome" || tourPhase === "dashboard") && featured) {
      setTourEventId(featured.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourPhase, featured?.id]);

  const leadCard = featured ? (
              <a
                href={`/events/${featured.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  logUsageEvent(
                    "signal_viewed",
                    signalEventMetadata(featured),
                    false,
                  )
                }
                className="relative overflow-hidden cursor-pointer group transition-all block"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Status Ribbon */}
                <div
                  className="absolute top-0 left-0 w-full h-[4px]"
                  style={{
                    backgroundColor:
                      featured.severity >= 9 ? "var(--accent)" : "var(--border)",
                  }}
                />

                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-4 items-center">
                      <span
                        data-tour="severity-badge"
                        className="px-2 py-0.5 text-[12px] md:text-[10px] font-bold "
                        style={{
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          backgroundColor:
                            featured.severity >= 9 ? "var(--accent)" : "var(--bg-container)",
                          color: featured.severity >= 9 ? "var(--bg-app)" : "var(--text-secondary)",
                        }}
                      >
                        {featured.severity >= 9
                          ? "Highest severity"
                          : featured.eventType || "Signal"}
                      </span>
                      <SeverityBadge score={featured.severity} />
                      <MediaImpactTag
                        entity={featured.mediaImpactEntity}
                        caveat={featured.mediaImpactCaveat}
                      />
                      <span
                        className="text-[12px] md:text-[11px]"
                        style={{
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          color: "var(--text-muted)",
                        }}
                      >
                        ID {featured.id.slice(0, 8)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[12px] md:text-[10px] "
                        style={{
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          color: "var(--text-muted)",
                        }}
                      >
                        {safeFormatDistanceToNow(
                          featured.eventDate ?? featured.createdAt,
                        )}{" "}
                        ago
                      </span>
                      <FreshTag
                        createdAt={featured.createdAt}
                        eventDate={featured.eventDate}
                        className="text-[12px] md:text-[10px]"
                        style={{
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          color: "var(--interactive)",
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-8 items-end">
                    <div className="flex-1">
                      <h2
                        className="font-story text-3xl md:text-4xl mb-4 leading-tight group-hover:underline"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {featured.title}
                      </h2>
                      {leadThread ? (
                        <p
                          data-testid="lead-thread-label"
                          className="mb-4 text-[13px]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {leadThread.members.length} related reports · {leadThread.totalReports} source reports in total
                        </p>
                      ) : null}

                      <div className="flex gap-10">
                        <div>
                          <div
                            className="text-[12px] md:text-[10px] mb-1"
                            style={{
                              color: "var(--text-muted)",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            Country / Region
                          </div>
                          <div
                            className="text-sm font-bold "
                            style={{
                              color: "var(--interactive)",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            {featured.country && countryToFlagEmoji(featured.country) ? (
                              <span data-testid="country-flag" className="mr-1 normal-case">
                                {countryToFlagEmoji(featured.country)}
                              </span>
                            ) : null}
                            {featured.country || "Global"}
                          </div>
                        </div>
                        <div data-tour="confidence-score">
                          <div
                            className="text-[12px] md:text-[10px] mb-1"
                            style={{
                              color: "var(--text-muted)",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            Confidence
                          </div>
                          <div
                            className="text-sm font-bold"
                            style={{
                              color: "var(--interactive)",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            {Math.round(featured.confidence * 100)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <span
                      data-tour="analyze-impact"
                      className="font-bold text-xs px-8 py-3 transition-all active:scale-95 duration-75 shrink-0 inline-block"
                      style={{
                        backgroundColor: "var(--interactive)",
                        color: "var(--on-interactive-bg)",
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        cursor: "pointer",
                      }}
                    >
                      View assessment
                    </span>
                  </div>
                </div>
              </a>
            ) : null;
  const feedReady = !(isError || degraded) && !(isLoading || (liveSignals.length === 0 && !filtersActive));

  return (
    <div
      className="flex h-screen w-full pt-16"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      {/* ── Center: Intelligence Feed (Main Canvas) ────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: "32px", maxWidth: "1440px", margin: "0 auto" }}
      >
        <Breadcrumbs items={[{ label: "Dashboard" }]} className="mb-4" />

        {/* Header */}
        <div className="mb-10" data-tour="feed-header">
          <h1
            className="text-3xl "
            style={{ color: "var(--text-primary)", fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            Intelligence Feed
          </h1>
          <p
            className="text-[14px] mt-1"
            style={{ color: "var(--text-secondary)", fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            {DASHBOARD_FEED_SUBHEAD}
          </p>
          {formatDataAsOf(dataUpdatedAt) ? (
            <p
              data-testid="data-as-of"
              className="text-[12px] md:text-[11px] mt-2"
              style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Sans', sans-serif" }}
              suppressHydrationWarning
            >
              {formatDataAsOf(dataUpdatedAt)}
            </p>
          ) : null}
          {coverageFailed ? (
            <SlowDataNotice onRetry={() => setCoverageRetry((n) => n + 1)} />
          ) : coverageLine ? (
            <p
              data-testid="coverage-line"
              className="text-[12px] md:text-[11px] mt-2"
              style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              {coverageLine}
            </p>
          ) : null}
          {windowExpandedLine ? (
            <p
              data-testid="window-expanded-line"
              className="text-[12px] md:text-[11px] mt-2"
              style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              {windowExpandedLine}
            </p>
          ) : null}
        </div>

        {/* Desk home: since-last-visit + lead story (8 cols) beside the markets ledger (4 cols).
            Mobile: one column, ledger first as a horizontal strip. */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="order-2 min-w-0 space-y-6 lg:order-1 lg:col-span-8">
            <SinceLastVisit signals={liveSignals} threadCount={threadCount} mover={mover} />
            {feedReady ? leadCard : null}
          </div>
          <div className="order-1 min-w-0 lg:order-2 lg:col-span-4">
            <MarketsLedger rows={ledger.rows} asOf={ledger.pricesUpdatedAt} loading={ledger.pricesLoading} />
          </div>
        </div>

        {fallback && (
          <div
            className="mb-6 px-3 py-2 rounded text-[12px] md:text-[11px] font-medium bg-yellow-600/95 text-black"
            suppressHydrationWarning
          >
            {feedDegradedCopy(fallbackReason)}
            {fallbackLastUpdated ? (
              <span className="ml-2 text-[12px] md:text-[10px] text-black/80" suppressHydrationWarning>
                (updated {safeFormatDistanceToNow(fallbackLastUpdated)} ago)
              </span>
            ) : null}
          </div>
        )}

        {/* Filter bar + trader-role desks (#124 / #125). My Feed stays a separate control. */}
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <div id="bbr-hint-dashboard-filters" data-hint="dashboard_filters">
            <FilterBar
              value={filters}
              onChange={handleFiltersChange}
              extraRegions={liveSignals.map((s) => s.region)}
            />
          </div>
          {typeof total === "number" && !isLoading && (
            <span
              data-testid="feed-total"
              data-feed-total={total}
              className="text-[12px] md:text-[11px] pb-1"
              style={{
                color: "var(--text-muted)",
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            >
              {total} signal{total === 1 ? "" : "s"}
            </span>
          )}

          <button
            type="button"
            data-testid="export-csv-button"
            onClick={handleExportCsv}
            disabled={liveSignals.length === 0}
            className="px-4 py-1.5 text-[12px] md:text-[11px] font-bold border transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2 min-h-[44px] md:min-h-0"
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              backgroundColor: "var(--bg-container)",
              color: "var(--text-secondary)",
              borderColor: "var(--border)",
            }}
          >
            <span className="material-symbols-outlined text-[14px]">download</span>
            Export CSV
          </button>

          {showMyFeedToggle && (
            <div className="ml-auto flex items-center gap-2 pb-0.5">
              <button
                onClick={() => setPersonalized((v) => !v)}
                aria-pressed={personalized}
                className="px-4 py-1.5 text-[12px] md:text-[11px] font-bold border transition-colors cursor-pointer flex items-center gap-2 min-h-[44px] md:min-h-0"
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  backgroundColor: personalized ? "var(--interactive-bg)" : "var(--bg-container)",
                  color: personalized ? "var(--on-interactive-bg)" : "var(--text-secondary)",
                  borderColor: personalized ? "var(--interactive)" : "var(--border)",
                }}
              >
                <span
                  className="material-symbols-outlined text-[14px]"
                  style={{ fontVariationSettings: personalized ? "'FILL' 1" : undefined }}
                >
                  {personalized ? "person" : "public"}
                </span>
                {personalized ? "My feed" : "Full feed"}
              </button>
            </div>
          )}
        </div>

        {/* Category filter chips (4.2) — dashboard only, not the map. */}
        <div className="mb-4">
          <CategoryChips
            value={filters.eventCategory}
            onChange={(eventCategory) => handleFiltersChange({ ...filters, eventCategory })}
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-5 md:mb-8" role="group" aria-label="Saved views">
          {(Object.keys(DESK_PRESETS) as DeskPresetId[]).map((id) => {
            const preset = DESK_PRESETS[id];
            const selected = deskMatchesFilters(id, filters);
            return (
              <button
                key={id}
                type="button"
                data-testid={`desk-${id}`}
                aria-pressed={selected}
                onClick={() => applyDesk(id)}
                className="px-3 py-1.5 text-[12px] md:text-[11px] font-bold border transition-colors cursor-pointer inline-flex items-center min-h-[44px] md:min-h-0"
                style={{
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  backgroundColor: selected ? "var(--interactive-bg)" : "var(--bg-container)",
                  color: selected ? "var(--on-interactive-bg)" : "var(--text-secondary)",
                  borderColor: selected ? "var(--interactive)" : "var(--border)",
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {personalized && personalizedApplied && (
          <p
            className="-mt-4 mb-8 text-[12px] md:text-[11px]"
            style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Sans', sans-serif" }}
          >
            Showing signals matching the commodities and regions you follow.{" "}
            <button
              onClick={() => setPersonalized(false)}
              className="underline cursor-pointer"
              style={{ color: "var(--interactive)" }}
            >
              Show the full feed
            </button>
          </p>
        )}

        {/* ── Continuous Skeleton Loader on API Load / Error / No Data ────────────────────────── */}
        {isError || degraded ? (
          <SlowDataNotice onRetry={() => void refetch()} />
        ) : isLoading || (liveSignals.length === 0 && !filtersActive) ? (
          <div className="space-y-8">
            {/* Featured Card Skeleton */}
            <div className="p-8 bg-[var(--bg-primary)] border border-[var(--border)] space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-32 bg-[var(--bg-elevated)]" />
                <Skeleton className="h-4 w-24 bg-[var(--bg-elevated)]" />
              </div>
              <Skeleton className="h-8 w-3/4 bg-[var(--bg-elevated)]" />
              <Skeleton className="h-4 w-full bg-[var(--bg-elevated)]" />
              <div className="flex justify-between items-center pt-4">
                <Skeleton className="h-10 w-48 bg-[var(--bg-elevated)]" />
                <Skeleton className="h-10 w-36 bg-[var(--bg-elevated)]" />
              </div>
            </div>

            {/* Grid Skeletons */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Skeleton className="h-64 w-full bg-[var(--bg-primary)] border border-[var(--border)]" />
              <Skeleton className="h-64 w-full bg-[var(--bg-primary)] border border-[var(--border)]" />
            </div>

            {/* Stream List Skeleton */}
            <div className="bg-[var(--bg-app)] border border-[var(--border)] p-6 space-y-4">
              <Skeleton className="h-6 w-48 bg-[var(--bg-elevated)]" />
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-[var(--bg-primary)]" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* ── Secondary Intelligence Grid ────────────────────────────── */}
            {(secondaryA || secondaryB) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                {/* Card A */}
                {secondaryA && (
                  <a
                    href={`/events/${secondaryA.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      logUsageEvent(
                        "signal_viewed",
                        signalEventMetadata(secondaryA),
                        false,
                      )
                    }
                    className="group cursor-pointer transition-colors block"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "var(--bg-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "var(--bg-primary)";
                    }}
                  >
                    <div className="p-6">
                      <div
                        className="flex justify-between items-center text-[12px] md:text-[10px] mb-2"
                        style={{
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          color: "var(--text-muted)",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span>
                            {safeFormatDistanceToNow(
                              secondaryA.eventDate ?? secondaryA.createdAt,
                            )}{" "}
                            ago
                          </span>
                          <FreshTag
                            createdAt={secondaryA.createdAt}
                            eventDate={secondaryA.eventDate}
                            className="text-[12px] md:text-[10px]"
                            style={{
                              fontFamily: "'IBM Plex Sans', sans-serif",
                              color: "var(--interactive)",
                            }}
                          />
                        </div>
                        <span className="text-[var(--interactive)] font-bold">
                          {secondaryA.country && countryToFlagEmoji(secondaryA.country) ? (
                            <span data-testid="country-flag" className="mr-1">
                              {countryToFlagEmoji(secondaryA.country)}
                            </span>
                          ) : null}
                          {secondaryA.country}
                        </span>
                      </div>
                      <h3
                        className="text-lg font-bold mb-3 group-hover:text-[var(--interactive)] transition-colors"
                        style={{
                          color: "var(--text-primary)",
                          fontFamily: "'IBM Plex Sans', sans-serif",
                        }}
                      >
                        {secondaryA.title}
                      </h3>
                      <p
                        className="text-sm leading-relaxed mb-6 line-clamp-2"
                        style={{
                          color: "var(--text-secondary)",
                          fontFamily: "'IBM Plex Sans', sans-serif",
                        }}
                      >
                        {secondaryA.summary}
                      </p>
                      <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                          <span
                            className="px-2 py-0.5 text-[12px] md:text-[10px] border"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              color: "var(--text-muted)",
                              borderColor: "var(--border)",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            {secondaryA.eventType || "Signal"}
                          </span>
                          <MediaImpactTag
                            entity={secondaryA.mediaImpactEntity}
                            caveat={secondaryA.mediaImpactCaveat}
                          />
                        </div>
                        <span
                          className="material-symbols-outlined text-xl"
                          style={{ color: "var(--interactive)" }}
                        >
                          arrow_forward
                        </span>
                      </div>
                    </div>
                  </a>
                )}

                {/* Card B */}
                {secondaryB && (
                  <a
                    href={`/events/${secondaryB.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      logUsageEvent(
                        "signal_viewed",
                        signalEventMetadata(secondaryB),
                        false,
                      )
                    }
                    className="group cursor-pointer transition-colors block"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "var(--bg-elevated)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "var(--bg-primary)";
                    }}
                  >
                    <div className="p-6">
                      <div
                        className="flex justify-between items-center text-[12px] md:text-[10px] mb-2"
                        style={{
                          fontFamily: "'IBM Plex Sans', sans-serif",
                          color: "var(--text-muted)",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span>
                            {safeFormatDistanceToNow(
                              secondaryB.eventDate ?? secondaryB.createdAt,
                            )}{" "}
                            ago
                          </span>
                          <FreshTag
                            createdAt={secondaryB.createdAt}
                            eventDate={secondaryB.eventDate}
                            className="text-[12px] md:text-[10px]"
                            style={{
                              fontFamily: "'IBM Plex Sans', sans-serif",
                              color: "var(--interactive)",
                            }}
                          />
                        </div>
                        <span className="text-[var(--interactive)] font-bold">
                          {secondaryB.country && countryToFlagEmoji(secondaryB.country) ? (
                            <span data-testid="country-flag" className="mr-1">
                              {countryToFlagEmoji(secondaryB.country)}
                            </span>
                          ) : null}
                          {secondaryB.country}
                        </span>
                      </div>
                      <h3
                        className="text-lg font-bold mb-3 group-hover:text-[var(--interactive)] transition-colors"
                        style={{
                          color: "var(--text-primary)",
                          fontFamily: "'IBM Plex Sans', sans-serif",
                        }}
                      >
                        {secondaryB.title}
                      </h3>
                      <p
                        className="text-sm leading-relaxed mb-6 line-clamp-2"
                        style={{
                          color: "var(--text-secondary)",
                          fontFamily: "'IBM Plex Sans', sans-serif",
                        }}
                      >
                        {secondaryB.summary}
                      </p>
                      <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                          <span
                            className="px-2 py-0.5 text-[12px] md:text-[10px] border"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              color: "var(--text-muted)",
                              borderColor: "var(--border)",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            {secondaryB.eventType || "Signal"}
                          </span>
                          <MediaImpactTag
                            entity={secondaryB.mediaImpactEntity}
                            caveat={secondaryB.mediaImpactCaveat}
                          />
                        </div>
                        <span
                          className="material-symbols-outlined text-xl"
                          style={{ color: "var(--interactive)" }}
                        >
                          bolt
                        </span>
                      </div>
                    </div>
                  </a>
                )}
              </div>
            )}

            {/* ── Intelligence Feed List ────────────────────────────── */}
            <section
              className="border"
              style={{ backgroundColor: "var(--bg-app)", borderColor: "var(--border)" }}
            >
              <div
                className="p-4 border-b flex justify-between items-center"
                style={{ borderColor: "var(--border)" }}
              >
                <h4
                  className="text-[12px] md:text-[11px] font-bold "
                  style={{
                    color: "var(--text-muted)",
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                  data-feed-total={total ?? undefined}
                >
                  Recent signal stream
                </h4>
                <div className="flex items-center gap-3">
                  <div
                    data-testid="feed-view-toggle"
                    role="group"
                    aria-label="Feed view"
                    className="flex border"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {(["cards", "table"] as const).map((mode) => {
                      const selected = feedViewMode === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          data-testid={`feed-view-${mode}`}
                          aria-pressed={selected}
                          onClick={() => setFeedViewModePersisted(mode)}
                          className="px-3 py-1 text-[12px] md:text-[10px] font-bold cursor-pointer"
                          style={{
                            fontFamily: "'IBM Plex Sans', sans-serif",
                            backgroundColor: selected ? "var(--interactive-bg)" : "transparent",
                            color: selected ? "var(--on-interactive-bg)" : "var(--text-muted)",
                          }}
                        >
                          {mode === "cards" ? "Cards" : "Table"}
                        </button>
                      );
                    })}
                  </div>
                  {feedViewMode === "cards" ? (
                    <button
                      type="button"
                      data-testid="feed-group-related"
                      aria-pressed={groupRelated}
                      onClick={() => setGroupRelatedPersisted(!groupRelated)}
                      className="px-3 py-1 text-[12px] md:text-[10px] font-bold cursor-pointer border"
                      style={{
                        borderColor: "var(--border)",
                        backgroundColor: groupRelated ? "var(--interactive-bg)" : "transparent",
                        color: groupRelated ? "var(--on-interactive-bg)" : "var(--text-muted)",
                      }}
                    >
                      Group related reports
                    </button>
                  ) : null}
                  {feedViewMode === "table" ? (
                    <button
                      type="button"
                      data-testid="feed-hide-summaries"
                      aria-pressed={hideSummaries}
                      onClick={() => setHideSummariesPersisted(!hideSummaries)}
                      className="px-3 py-1 text-[12px] md:text-[10px] font-bold cursor-pointer border"
                      style={{
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        borderColor: "var(--border)",
                        backgroundColor: hideSummaries ? "var(--interactive-bg)" : "transparent",
                        color: hideSummaries ? "var(--on-interactive-bg)" : "var(--text-muted)",
                      }}
                    >
                      Hide summaries
                    </button>
                  ) : null}
                </div>
              </div>
              {feedViewMode === "table" ? (
                <SignalTable signals={streamList} hideSummaries={hideSummaries} />
              ) : (
              <div
                className="divide-y"
                style={{ borderColor: "var(--border)" }}
              >
                {streamList.length > 0 ? (
                  streamItems.map((entry, index) => {
                    if (entry.kind === "thread") {
                      return <StoryThreadCard key={`thread-${entry.thread.id}`} thread={entry.thread} />;
                    }
                    const item = entry.signal;
                    return (
                    <div
                      key={item.id}
                      className="px-6 py-4 flex items-center gap-6 group transition-colors"
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "var(--bg-container)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "transparent";
                      }}
                    >
                      <a
                        href={`/events/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="signal-stream-row"
                        onClick={() =>
                          logUsageEvent(
                            "signal_viewed",
                            signalEventMetadata(item),
                            false,
                          )
                        }
                        className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-6"
                      >
                        {/* Metadata: its own row on mobile so it never competes with the headline for width.
                            flex-wrap so MediaImpactTag (previously hidden below md) drops to its own line
                            on narrow screens instead of being cut off — dot/timestamp/FreshTag are shrink-0
                            and always stay on the first line. */}
                        <div className="flex flex-wrap items-center gap-2 md:gap-6 md:shrink-0">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                item.severity >= 9 ? "var(--accent)" : "var(--text-muted)",
                            }}
                          />
                          <div
                            className="w-16 md:w-20 text-[12px] shrink-0"
                            style={{
                              color: "var(--text-muted)",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            {safeFormatDistanceToNow(item.eventDate ?? item.createdAt)}
                          </div>
                          <FreshTag
                            createdAt={item.createdAt}
                            eventDate={item.eventDate}
                            className="text-[12px] md:text-[11px] shrink-0"
                            style={{
                              fontFamily: "'IBM Plex Sans', sans-serif",
                              color: "var(--interactive)",
                            }}
                          />
                          <MediaImpactTag
                            entity={item.mediaImpactEntity}
                            caveat={item.mediaImpactCaveat}
                          />
                          <SignalRowPriceChip signal={item} prices={latestPrices} />
                        </div>

                        {/* Headline: full row width on mobile (2-line clamp); single-line truncate at md+, unchanged */}
                        <div className="flex items-center gap-2 md:min-w-0 md:flex-1 md:gap-6">
                          <div
                            className="flex-1 min-w-0 line-clamp-2 md:truncate md:line-clamp-none font-semibold transition-colors group-hover:text-[var(--interactive)]"
                            style={{
                              color: "var(--text-primary)",
                              fontFamily: "'IBM Plex Sans', sans-serif",
                            }}
                          >
                            {item.title}
                          </div>
                          {sourceConfirmationLabel(item.sourceConfirmation) != null && (
                            <div
                              className="text-[12px] px-2 py-0.5 border shrink-0"
                              style={{
                                color: "var(--interactive)",
                                backgroundColor: "var(--bg-container)",
                                borderColor: "var(--border)",
                                fontFamily: "'IBM Plex Sans', sans-serif",
                              }}
                            >
                              {sourceConfirmationLabel(item.sourceConfirmation)}
                            </div>
                          )}
                          <span
                            className="material-symbols-outlined text-lg shrink-0 group-hover:translate-x-1 transition-transform"
                            style={{ color: "var(--text-muted)" }}
                          >
                            chevron_right
                          </span>
                        </div>
                      </a>
                      <button
                        type="button"
                        data-tour={index === 0 ? "quick-view" : undefined}
                        data-testid="signal-quick-view-open"
                        aria-label="Quick view"
                        onClick={() => setQuickViewSignal(item)}
                        className="hidden md:inline-flex h-8 w-8 shrink-0 items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--interactive)]"
                      >
                        <span className="material-symbols-outlined text-lg">preview</span>
                      </button>
                    </div>
                    );
                  })
                ) : (
                  <div className="py-20 text-center flex flex-col items-center gap-4">
                    <span className="material-symbols-outlined text-4xl text-[var(--border)]">
                      search_off
                    </span>
                    <p
                      className="text-xs font-bold "
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "'IBM Plex Sans', sans-serif",
                      }}
                    >
                      No active signals matching filter
                    </p>
                  </div>
                )}
              </div>
              )}
              {streamList.length > 0 && (
                <>
                  {/* Scroll-triggered loading: IntersectionObserver fires
                      fetchNextPage once this comes near the viewport, ahead
                      of the LoadMoreButton below (which stays as a manual
                      fallback / the "you've reached the end" terminal state). */}
                  {canLoadMoreStream && <div ref={sentinelRef} aria-hidden="true" />}
                  <LoadMoreButton
                    hasMore={canLoadMoreStream}
                    isLoading={isFetchingNextPage}
                    onClick={handleLoadMoreStream}
                    loadedCount={streamList.length}
                    totalCount={total}
                    endLabel={streamEndLabel}
                  />
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/* ── Right: Market & AI Sidebar ────────────────────────── */}
      <aside
        className="w-[260px] shrink-0 border-l flex flex-col overflow-y-auto hidden xl:flex"
        style={{ borderColor: "var(--bg-elevated)", backgroundColor: "var(--bg-app)" }}
      >
        <div className="p-6">
          <div className="mb-8">
            <div
              className="text-sm font-bold"
              style={{
                color: "var(--interactive)",
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}
            >
              MARKET & INTELLIGENCE
            </div>
          </div>

          <div className="space-y-6">
            {/* AI Module (now shows honest system status link) */}
            <div
              className="p-4 border"
              style={{ backgroundColor: "var(--bg-app)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ color: "var(--interactive)" }}
                >
                  psychology
                </span>
                <span
                  className="text-[12px] md:text-[10px]"
                  style={{
                    color: "var(--interactive)",
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                >
                  SYSTEM STATUS
                </span>
              </div>
              <div
                className="text-xs leading-relaxed mb-2"
                style={{ color: "var(--text-primary)", fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                Signal collection and classification across configured
                regions and sources.
              </div>
              <a
                href="/status"
                className="text-xs text-[var(--text-secondary)] hover:underline"
              >
                View pipeline & ingestion details
              </a>
            </div>

            {/* Active Hotzones: computed from live signals */}
            <div
              className="p-4 border"
              style={{ backgroundColor: "var(--bg-app)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ color: "var(--interactive)" }}
                >
                  radar
                </span>
                <span
                  className="text-[12px] md:text-[10px]"
                  style={{
                    color: "var(--interactive)",
                    fontFamily: "'IBM Plex Sans', sans-serif",
                  }}
                >
                  ACTIVE HOTZONES
                </span>
              </div>
              <ul
                className="space-y-2 text-[12px] md:text-[10px]"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                {topHotzones.length === 0 ? (
                  <li className="text-[var(--text-muted)]">
                    No active hotzones detected
                  </li>
                ) : (
                  topHotzones.map((hz) => {
                    const label =
                      hz.avgSeverity >= 8
                        ? "HIGH"
                        : hz.avgSeverity >= 5
                          ? "MED"
                          : "LOW";
                    const color =
                      label === "HIGH"
                        ? "var(--price-down)"
                        : label === "MED"
                          ? "var(--danger)"
                          : "var(--interactive)";
                    return (
                      <li
                        key={hz.region}
                        className="flex items-center justify-between"
                      >
                        <span style={{ color: "var(--text-primary)" }}>{hz.region}</span>
                        <span className="font-bold" style={{ color }}>
                          {label}
                        </span>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>
      </aside>

      <SignalQuickView
        signal={quickViewSignal}
        onClose={() => setQuickViewSignal(null)}
      />
    </div>
  );
}
