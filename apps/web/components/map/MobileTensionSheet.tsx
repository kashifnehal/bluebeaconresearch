"use client";

import { useState } from "react";
import type { Signal } from "@blue-beacon-research/shared";
import { safeFormatDistanceToNow } from "@/lib/utils";
import { FreshTag } from "@/components/signals/FreshTag";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { Skeleton } from "@/components/ui/skeleton";

type TensionMetrics = {
  cyber: number;
  kinetic: number;
  diplomatic: number;
  score: number;
  sampleSize: number;
};

type TensionHistoryBucket = { score: number | null; label: string };

type GeoSignal = Signal & { lat: number; lng: number };

// Mobile-only (md:hidden) bottom sheet — replaces the two always-mounted
// desktop side panels below md, which otherwise overlap the entire map on a
// phone (#186 Phase 4). Deliberately tap-to-expand rather than drag-to-resize:
// same benefit, far less gesture-handling risk for a v1. Renders the exact
// same tension metrics and stream data as the desktop panels in map/page.tsx
// — this component owns no data or business logic of its own, only layout.
export function MobileTensionSheet({
  expanded,
  onToggleExpanded,
  onOpenFilters,
  tensionMetrics,
  tensionHistory,
  liveItems,
  isLoading,
  isError,
  selectedSignalId,
  onSelectSignal,
  canLoadMore,
  isFetchingMore,
  onLoadMore,
  onOpenTerminal,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenFilters: () => void;
  tensionMetrics: TensionMetrics;
  tensionHistory: TensionHistoryBucket[];
  liveItems: GeoSignal[];
  isLoading: boolean;
  isError: boolean;
  selectedSignalId: string | null;
  onSelectSignal: (signal: Signal) => void;
  canLoadMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onOpenTerminal: () => void;
}) {
  const [tensionInfoOpen, setTensionInfoOpen] = useState(false);

  return (
    <div className="md:hidden fixed inset-x-0 bottom-[60px] z-30 flex flex-col">
      {expanded && (
        <div className="flex-1 overflow-y-auto bg-surface-container-lowest/95 backdrop-blur-md border-t border-x border-outline-variant/30 rounded-t-2xl px-4 pt-2 pb-4 max-h-[calc(75vh-60px)]">
          <div className="w-10 h-1 rounded-full bg-outline-variant/40 mx-auto mb-4" />

          <div className="flex items-center gap-1.5 mb-3">
            <span className="label text-[10px] tracking-[0.2em] text-on-surface-variant uppercase">
              Tension Breakdown
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setTensionInfoOpen((v) => !v)}
                aria-label="About the Global Tension Index"
                aria-expanded={tensionInfoOpen}
                className="flex items-center justify-center w-5 h-5 rounded-full text-on-surface-variant/60 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px] leading-none">info</span>
              </button>
              {tensionInfoOpen && (
                <div
                  role="tooltip"
                  className="absolute left-0 top-full mt-2 w-56 z-30 p-3 rounded-lg bg-surface-container-high border border-outline-variant/40 shadow-xl text-[11px] leading-relaxed text-on-surface-variant normal-case tracking-normal"
                >
                  Composite score derived from regional conflict density, kinetic strikes, and maritime disruption metrics.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 mb-6">
            <div>
              <div className="flex justify-between label text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">
                <span>Cyber Warfare</span>
                <span className="font-mono text-primary">{tensionMetrics.cyber}%</span>
              </div>
              <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${tensionMetrics.cyber}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between label text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">
                <span>Kinetic Conflict</span>
                <span className="font-mono text-primary">{tensionMetrics.kinetic}%</span>
              </div>
              <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${tensionMetrics.kinetic}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between label text-[10px] text-on-surface-variant mb-1.5 uppercase tracking-wider">
                <span>Diplomatic Friction</span>
                <span className="font-mono text-primary">{tensionMetrics.diplomatic}%</span>
              </div>
              <div className="h-1 bg-surface-container-high rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${tensionMetrics.diplomatic}%` }} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="label text-xs tracking-[0.2em] font-bold text-on-surface uppercase">
                Intelligence Stream
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {isLoading || isError ? (
              [...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full bg-surface-container/40 rounded-lg" />
              ))
            ) : liveItems.length > 0 ? (
              liveItems.map((signal) => {
                const isUrgent = signal.severity >= 8;
                const borderStyle = isUrgent ? "border-error" : "border-primary";
                const isSelected = signal.id === selectedSignalId;
                return (
                  <div
                    key={signal.id}
                    onClick={() => onSelectSignal(signal)}
                    className={`p-3 rounded-lg border-l-2 ${borderStyle} transition-colors cursor-pointer group ${
                      isSelected
                        ? "bg-primary/15 ring-1 ring-primary/40"
                        : "bg-surface-container/40 hover:bg-surface-container/60"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-1.5 py-0.5 label text-[10px] border uppercase ${isUrgent ? "bg-error/10 text-error border-error/20" : "bg-primary/10 text-primary border-primary/20"}`}
                      >
                        {isUrgent ? "URGENT" : "SIGNAL"}
                      </span>
                      <span className="font-mono text-[10px] text-on-surface-variant">
                        {safeFormatDistanceToNow(signal.eventDate ?? signal.createdAt)} ago
                      </span>
                      <FreshTag createdAt={signal.createdAt} className="font-mono text-[10px] text-primary" />
                    </div>
                    <p className="text-[13px] leading-relaxed text-on-surface mb-2 font-medium line-clamp-2">
                      {signal.title}
                    </p>
                    <a
                      href={`/events/${signal.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="label text-[11px] text-primary inline-flex items-center gap-1 min-h-[44px]"
                    >
                      VIEW DETAILS
                      <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                    </a>
                  </div>
                );
              })
            ) : (
              <div className="flex items-center justify-center p-6 grayscale opacity-50">
                <span className="label text-[10px] tracking-widest uppercase">No stream data</span>
              </div>
            )}
            {!isLoading && !isError && (
              <LoadMoreButton
                hasMore={canLoadMore}
                isLoading={isFetchingMore}
                onClick={onLoadMore}
                loadedCount={liveItems.length}
                endLabel="End of stream"
              />
            )}
          </div>

          <button
            onClick={onOpenTerminal}
            className="w-full mt-4 bg-primary-container py-3 rounded-lg flex items-center justify-center gap-3 hover:brightness-110 transition-all text-on-primary-container font-bold label text-xs cursor-pointer min-h-[44px]"
          >
            <span className="material-symbols-outlined text-sm">terminal</span>
            OPEN FULL TERMINAL
          </button>
        </div>
      )}

      {/* Peek header — always visible, tap toggles expanded. Same tension
          score data as the desktop panel's headline number. A <div> with
          role="button" rather than a real <button>, because it contains the
          filter button below — nesting interactive elements inside a
          <button> is invalid HTML and breaks screen-reader semantics. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpanded();
          }
        }}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse tension summary" : "Expand tension summary"}
        className={`bg-surface-container-lowest/95 backdrop-blur-md border-t border-x border-outline-variant/30 px-4 py-3 flex items-center justify-between gap-3 min-h-[44px] cursor-pointer ${expanded ? "" : "rounded-t-2xl"}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
          <div className="text-left min-w-0">
            <div className="label text-[9px] tracking-[0.2em] text-on-surface-variant uppercase">
              Global Tension
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-bold text-on-surface">{tensionMetrics.score}</span>
              <span className="font-mono text-[9px] text-on-surface-variant/70 truncate">
                {tensionMetrics.sampleSize} active
              </span>
            </div>
          </div>
        </div>
        {tensionHistory.some((b) => b.score != null) && (
          <div className="flex items-end gap-[2px] h-5 shrink-0" aria-hidden>
            {tensionHistory.map((b, i) => (
              <div
                key={i}
                className={`w-1 rounded-sm ${b.score != null ? "bg-primary/50" : "bg-surface-container-high"}`}
                style={{ height: b.score != null ? `${Math.max(15, (b.score / 99) * 100)}%` : "20%" }}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFilters();
            }}
            aria-label="Open filters"
            className="w-11 h-11 rounded-full bg-surface-container flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
          </button>
          <span className="material-symbols-outlined text-on-surface-variant">
            {expanded ? "expand_more" : "expand_less"}
          </span>
        </div>
      </div>
    </div>
  );
}
