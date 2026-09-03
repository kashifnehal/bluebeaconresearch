"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { IngestionStatusBanner } from "@/components/IngestionStatusBanner";
import { useSignalFeed } from "@/hooks/useSignalFeed";
import { useUIStore } from "@/store/useUIStore";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { safeFormatDistanceToNow } from "@/lib/utils";
import { fetchMyProfile } from "@/lib/profile";
import { logUsageEvent } from "@/lib/funnel-events";

export default function DashboardPage() {
  const router = useRouter();
  const {
    liveSignals,
    isLoading,
    isError,
    fallback,
    fallbackReason,
    fallbackLastUpdated,
    total,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSignalFeed({ enabled: true });
  const { searchQuery, tourActive, tourPhase, startTour, setTourEventId } = useUIStore();
  const [filter, setFilter] = useState<"all" | "high">("all");
  // How many rows of the "Recent Signal Stream" are visible. Starts at 10 (the
  // list's prior fixed size, so the first render is unchanged); "Load more" adds
  // 10 and pulls the next API page once the current pages are exhausted.
  const [streamCount, setStreamCount] = useState(10);

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

  // Filter by severity pill
  const filteredBySeverity = useMemo(() => {
    if (filter === "high") {
      return liveSignals.filter((s) => s.severity >= 8);
    }
    return liveSignals;
  }, [liveSignals, filter]);

  // Filter by search query
  const filteredSignals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredBySeverity;
    return filteredBySeverity.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.country?.toLowerCase().includes(q) ||
        s.eventType?.toLowerCase().includes(q) ||
        s.summary?.toLowerCase().includes(q),
    );
  }, [filteredBySeverity, searchQuery]);

  const featured =
    filteredSignals.find((s) => s.severity >= 8) || filteredSignals[0];
  const secondaryA = filteredSignals[1];
  const secondaryB = filteredSignals[2];
  const streamList = filteredSignals.slice(0, streamCount);

  // A client severity/search filter makes the API's raw `total` an over-count for
  // this view, so only surface the "X of Y" number on the unfiltered stream.
  const streamFilterActive = filter !== "all" || searchQuery.trim().length > 0;
  const canLoadMoreStream = streamCount < filteredSignals.length || hasNextPage;
  const handleLoadMoreStream = () => {
    setStreamCount((c) => c + 10);
    if (streamCount + 10 >= filteredSignals.length && hasNextPage) {
      void fetchNextPage();
    }
  };

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
  // the dashboard phase of the tour is active (covers both first-run and
  // "Replay product tour" from the Help modal).
  useEffect(() => {
    if (tourActive && tourPhase === "dashboard" && featured) {
      setTourEventId(featured.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourActive, tourPhase, featured?.id]);

  return (
    <div
      className="flex h-screen w-full pt-16"
      style={{ backgroundColor: "#0e0e0e" }}
    >
      {/* ── Center: Intelligence Feed (Main Canvas) ────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: "32px", maxWidth: "1440px", margin: "0 auto" }}
      >
        {/* Header */}
        <div className="mb-10" data-tour="feed-header">
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}
          >
            Intelligence Feed
          </h1>
          <p
            className="text-[14px] mt-1"
            style={{ color: "#acabaa", fontFamily: "'Inter', sans-serif" }}
          >
            Real-time global signal monitoring
          </p>
        </div>

        <IngestionStatusBanner />

        {fallback && (
          <div
            className="mb-6 px-3 py-2 rounded text-[11px] font-medium bg-yellow-600/95 text-black"
            suppressHydrationWarning
          >
            Signal feed degraded — {fallbackReason ?? "unknown"}. Showing last available data
            {fallbackLastUpdated ? (
              <span className="ml-2 text-[10px] text-black/80" suppressHydrationWarning>
                (updated {safeFormatDistanceToNow(fallbackLastUpdated)} ago)
              </span>
            ) : null}
          </div>
        )}

        {/* Filter Pills */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setFilter("all")}
            className="px-4 py-1.5 text-[11px] font-bold tracking-widest border transition-colors cursor-pointer"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              backgroundColor: filter === "all" ? "#4edea3" : "#201f1f",
              color: filter === "all" ? "#005f40" : "#bbcac0",
              borderColor: filter === "all" ? "#4edea3" : "#3c4a42",
            }}
          >
            ALL SIGNALS
          </button>
          <button
            onClick={() => setFilter("high")}
            className="px-4 py-1.5 text-[11px] font-bold tracking-widest border transition-colors cursor-pointer"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              backgroundColor: filter === "high" ? "#4edea3" : "#201f1f",
              color: filter === "high" ? "#005f40" : "#bbcac0",
              borderColor: filter === "high" ? "#4edea3" : "#3c4a42",
            }}
          >
            HIGH RISK
          </button>
        </div>

        {/* ── Continuous Skeleton Loader on API Load / Error / No Data ────────────────────────── */}
        {isLoading || isError || liveSignals.length === 0 ? (
          <div className="space-y-8">
            {/* Featured Card Skeleton */}
            <div className="p-8 bg-[#131313] border border-[#3c4a42] space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-32 bg-[#2a2a2a]" />
                <Skeleton className="h-4 w-24 bg-[#2a2a2a]" />
              </div>
              <Skeleton className="h-8 w-3/4 bg-[#2a2a2a]" />
              <Skeleton className="h-4 w-full bg-[#2a2a2a]" />
              <div className="flex justify-between items-center pt-4">
                <Skeleton className="h-10 w-48 bg-[#2a2a2a]" />
                <Skeleton className="h-10 w-36 bg-[#2a2a2a]" />
              </div>
            </div>

            {/* Grid Skeletons */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Skeleton className="h-64 w-full bg-[#131313] border border-[#3c4a42]" />
              <Skeleton className="h-64 w-full bg-[#131313] border border-[#3c4a42]" />
            </div>

            {/* Stream List Skeleton */}
            <div className="bg-[#0e0e0e] border border-[#3c4a42] p-6 space-y-4">
              <Skeleton className="h-6 w-48 bg-[#2a2a2a]" />
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-[#131313]" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* ── Featured Critical Card ────────────────────────────────── */}
            {featured ? (
              <section
                onClick={() => router.push(`/events/${featured.id}`)}
                className="mb-10 relative overflow-hidden cursor-pointer group transition-all"
                style={{
                  backgroundColor: "#131313",
                  border: "1px solid #3c4a42",
                }}
              >
                {/* Status Ribbon */}
                <div
                  className="absolute top-0 left-0 w-full h-[4px]"
                  style={{
                    backgroundColor:
                      featured.severity >= 8 ? "#ee7d77" : "#4edea3",
                  }}
                />

                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex gap-4 items-center">
                      <span
                        data-tour="severity-badge"
                        className="px-2 py-0.5 text-[10px] font-bold tracking-tighter"
                        style={{
                          fontFamily: "'Space Grotesk', sans-serif",
                          backgroundColor:
                            featured.severity >= 8 ? "#7f2927" : "#262626",
                          color: featured.severity >= 8 ? "#ff9993" : "#4edea3",
                        }}
                      >
                        {featured.severity >= 8
                          ? "PRIORITY: CRITICAL"
                          : featured.eventType || "SIGNAL"}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "#86948a",
                        }}
                      >
                        ID: {featured.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <span
                      className="text-[10px] uppercase tracking-widest"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "#86948a",
                      }}
                    >
                      {safeFormatDistanceToNow(
                        featured.eventDate ?? featured.createdAt,
                      ).toUpperCase()}{" "}
                      AGO
                    </span>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-8 items-end">
                    <div className="flex-1">
                      <h2
                        className="text-2xl font-bold mb-4 leading-tight group-hover:text-[#4edea3] transition-colors"
                        style={{
                          color: "#e5e2e1",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {featured.title}
                      </h2>

                      <div className="flex gap-10">
                        <div>
                          <div
                            className="text-[10px] uppercase mb-1"
                            style={{
                              color: "#86948a",
                              fontFamily: "'Space Grotesk', sans-serif",
                            }}
                          >
                            Country / Region
                          </div>
                          <div
                            className="text-sm font-bold uppercase"
                            style={{
                              color: "#4edea3",
                              fontFamily: "'Inter', sans-serif",
                            }}
                          >
                            {featured.country || "Global"}
                          </div>
                        </div>
                        <div data-tour="confidence-score">
                          <div
                            className="text-[10px] uppercase mb-1"
                            style={{
                              color: "#86948a",
                              fontFamily: "'Space Grotesk', sans-serif",
                            }}
                          >
                            Confidence
                          </div>
                          <div
                            className="text-sm font-bold"
                            style={{
                              color: "#4edea3",
                              fontFamily: "'Inter', sans-serif",
                            }}
                          >
                            {Math.round(featured.confidence * 100)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      data-tour="analyze-impact"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/events/${featured.id}`);
                      }}
                      className="font-bold text-xs tracking-widest px-8 py-3 transition-all active:scale-95 duration-75 shrink-0"
                      style={{
                        backgroundColor: "#4edea3",
                        color: "#003824",
                        fontFamily: "'Space Grotesk', sans-serif",
                        cursor: "pointer",
                      }}
                    >
                      ANALYZE IMPACT
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {/* ── Secondary Intelligence Grid ────────────────────────────── */}
            {(secondaryA || secondaryB) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                {/* Card A */}
                {secondaryA && (
                  <article
                    onClick={() => router.push(`/events/${secondaryA.id}`)}
                    className="group cursor-pointer transition-colors"
                    style={{
                      backgroundColor: "#131313",
                      border: "1px solid #3c4a42",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "#2a2a2a";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "#131313";
                    }}
                  >
                    <div className="p-6">
                      <div
                        className="flex justify-between items-center text-[10px] mb-2"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "#86948a",
                        }}
                      >
                        <span>
                          {safeFormatDistanceToNow(
                            secondaryA.eventDate ?? secondaryA.createdAt,
                          ).toUpperCase()}{" "}
                          AGO
                        </span>
                        <span className="text-[#4edea3] font-bold">
                          {secondaryA.country}
                        </span>
                      </div>
                      <h3
                        className="text-lg font-bold mb-3 group-hover:text-[#4edea3] transition-colors"
                        style={{
                          color: "#e5e2e1",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {secondaryA.title}
                      </h3>
                      <p
                        className="text-sm leading-relaxed mb-6 line-clamp-2"
                        style={{
                          color: "#bbcac0",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {secondaryA.summary}
                      </p>
                      <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                          <span
                            className="px-2 py-0.5 text-[10px] uppercase border"
                            style={{
                              backgroundColor: "#2a2a2a",
                              color: "#86948a",
                              borderColor: "#3c4a42",
                              fontFamily: "'Space Grotesk', sans-serif",
                            }}
                          >
                            {secondaryA.eventType || "INTELLIGENCE"}
                          </span>
                        </div>
                        <span
                          className="material-symbols-outlined text-xl"
                          style={{ color: "#4edea3" }}
                        >
                          arrow_forward
                        </span>
                      </div>
                    </div>
                  </article>
                )}

                {/* Card B */}
                {secondaryB && (
                  <article
                    onClick={() => router.push(`/events/${secondaryB.id}`)}
                    className="group cursor-pointer transition-colors"
                    style={{
                      backgroundColor: "#131313",
                      border: "1px solid #3c4a42",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "#2a2a2a";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "#131313";
                    }}
                  >
                    <div className="p-6">
                      <div
                        className="flex justify-between items-center text-[10px] mb-2"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          color: "#86948a",
                        }}
                      >
                        <span>
                          {safeFormatDistanceToNow(
                            secondaryB.eventDate ?? secondaryB.createdAt,
                          ).toUpperCase()}{" "}
                          AGO
                        </span>
                        <span className="text-[#4edea3] font-bold">
                          {secondaryB.country}
                        </span>
                      </div>
                      <h3
                        className="text-lg font-bold mb-3 group-hover:text-[#4edea3] transition-colors"
                        style={{
                          color: "#e5e2e1",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {secondaryB.title}
                      </h3>
                      <p
                        className="text-sm leading-relaxed mb-6 line-clamp-2"
                        style={{
                          color: "#bbcac0",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {secondaryB.summary}
                      </p>
                      <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                          <span
                            className="px-2 py-0.5 text-[10px] uppercase border"
                            style={{
                              backgroundColor: "#2a2a2a",
                              color: "#86948a",
                              borderColor: "#3c4a42",
                              fontFamily: "'Space Grotesk', sans-serif",
                            }}
                          >
                            {secondaryB.eventType || "MARKET DRIFT"}
                          </span>
                        </div>
                        <span
                          className="material-symbols-outlined text-xl"
                          style={{ color: "#4edea3" }}
                        >
                          bolt
                        </span>
                      </div>
                    </div>
                  </article>
                )}
              </div>
            )}

            {/* ── Intelligence Feed List ────────────────────────────── */}
            <section
              className="border"
              style={{ backgroundColor: "#0e0e0e", borderColor: "#3c4a42" }}
            >
              <div
                className="p-4 border-b flex justify-between items-center"
                style={{ borderColor: "#3c4a42" }}
              >
                <h4
                  className="text-[11px] font-bold tracking-widest uppercase"
                  style={{
                    color: "#86948a",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  Recent Signal Stream
                </h4>
                <span
                  className="text-[10px]"
                  style={{
                    color: "#4edea3",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  LIVE DATA FEED ON
                </span>
              </div>
              <div
                className="divide-y"
                style={{ borderColor: "rgba(60,74,66,0.3)" }}
              >
                {streamList.length > 0 ? (
                  streamList.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => router.push(`/events/${item.id}`)}
                      className="px-6 py-4 flex items-center gap-6 cursor-pointer group transition-colors"
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "#1f1f1f";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          "transparent";
                      }}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            item.severity >= 8 ? "#ee7d77" : "#4edea3",
                        }}
                      />
                      <div
                        className="w-20 text-[12px] shrink-0"
                        style={{
                          color: "#86948a",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {safeFormatDistanceToNow(item.eventDate ?? item.createdAt)}
                      </div>
                      <div
                        className="flex-1 font-semibold transition-colors group-hover:text-[#4edea3]"
                        style={{
                          color: "#e5e2e1",
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {item.title}
                      </div>
                      <div
                        className="text-[12px] px-2 py-0.5 border shrink-0"
                        style={{
                          color: "#4edea3",
                          backgroundColor: "rgba(78,222,163,0.1)",
                          borderColor: "rgba(78,222,163,0.2)",
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {Math.round(item.confidence * 100)}% CONFIDENCE
                      </div>
                      <span
                        className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform"
                        style={{ color: "#86948a" }}
                      >
                        chevron_right
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center flex flex-col items-center gap-4">
                    <span className="material-symbols-outlined text-4xl text-[#3c4a42]">
                      search_off
                    </span>
                    <p
                      className="text-xs font-bold uppercase tracking-[0.2em]"
                      style={{
                        color: "#86948a",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      {searchQuery
                        ? `No results for '${searchQuery}'`
                        : "No active signals matching filter"}
                    </p>
                  </div>
                )}
              </div>
              {streamList.length > 0 && (
                <LoadMoreButton
                  hasMore={canLoadMoreStream}
                  isLoading={isFetchingNextPage}
                  onClick={handleLoadMoreStream}
                  loadedCount={streamList.length}
                  totalCount={streamFilterActive ? null : total}
                  endLabel="End of signal stream"
                />
              )}
            </section>
          </>
        )}
      </div>

      {/* ── Right: Market & AI Sidebar ────────────────────────── */}
      <aside
        className="w-[260px] shrink-0 border-l flex flex-col overflow-y-auto hidden xl:flex"
        style={{ borderColor: "#2a2a2a", backgroundColor: "#0e0e0e" }}
      >
        <div className="p-6">
          <div className="mb-8">
            <div
              className="text-sm font-bold"
              style={{
                color: "#4edea3",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              MARKET & INTELLIGENCE
            </div>
            <div
              className="text-[10px] tracking-widest mt-1"
              style={{
                color: "#bbcac0",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              REAL-TIME SYNTHESIS
            </div>
          </div>

          <div className="space-y-6">
            {/* AI Module (now shows honest system status link) */}
            <div
              className="p-4 border"
              style={{ backgroundColor: "#0e0e0e", borderColor: "#3c4a42" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ color: "#4edea3" }}
                >
                  psychology
                </span>
                <span
                  className="text-[10px]"
                  style={{
                    color: "#4edea3",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  SENTINEL
                </span>
              </div>
              <div
                className="text-xs leading-relaxed mb-2"
                style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}
              >
                Autonomous monitoring active across configured intelligence
                nodes.
              </div>
              <div
                className="text-[12px] font-bold mb-1"
                style={{ color: "#4edea3" }}
              >
                System status: Operational
              </div>
              <a
                href="/status"
                className="text-xs text-[#bbcac0] hover:underline"
              >
                View pipeline & ingestion details
              </a>
            </div>

            {/* Active Hotzones: computed from live signals */}
            <div
              className="p-4 border"
              style={{ backgroundColor: "#0e0e0e", borderColor: "#3c4a42" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ color: "#4edea3" }}
                >
                  radar
                </span>
                <span
                  className="text-[10px]"
                  style={{
                    color: "#4edea3",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  ACTIVE HOTZONES
                </span>
              </div>
              <ul
                className="space-y-2 text-[10px]"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {topHotzones.length === 0 ? (
                  <li className="text-[#86948a]">
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
                        ? "#ee7d77"
                        : label === "MED"
                          ? "#ffb4ab"
                          : "#4edea3";
                    return (
                      <li
                        key={hz.region}
                        className="flex items-center justify-between"
                      >
                        <span style={{ color: "#e5e2e1" }}>{hz.region}</span>
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
    </div>
  );
}
