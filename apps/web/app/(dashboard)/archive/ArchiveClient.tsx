"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useArchiveFeed } from "@/hooks/useArchiveFeed";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { Skeleton } from "@/components/ui/skeleton";
import { SignalCard } from "@/components/signals/SignalCard";
import { SignalQuickView } from "@/components/signals/SignalQuickView";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { feedDegradedCopy } from "@/lib/user-error-copy";
import { SELECT_CLASSES } from "@/lib/utils";
import { logUsageEvent, signalEventMetadata } from "@/lib/funnel-events";
import {
  DESK_PRESETS,
  FILTER_CATEGORIES,
  FILTER_COMMODITIES,
  COMMODITY_CATEGORY_PREFIX,
  buildRegionOptions,
  deskMatchesFilters,
  type DeskPresetId,
} from "@/lib/signal-filters";
import type { Signal } from "@blue-beacon-research/shared";

type ArchiveFilters = {
  commodity: string | null;
  region: string | null;
  from: string;
  to: string;
  keyword: string;
};

const EMPTY_FILTERS: ArchiveFilters = {
  commodity: null,
  region: null,
  from: "",
  to: "",
  keyword: "",
};

export function ArchiveClient() {
  const [filters, setFilters] = useState<ArchiveFilters>(EMPTY_FILTERS);
  const [quickViewSignal, setQuickViewSignal] = useState<Signal | null>(null);

  const datesInvalid = Boolean(filters.from && filters.to && filters.from > filters.to);
  const searchParam =
    filters.keyword.trim().length >= 3 ? filters.keyword.trim() : null;

  const {
    liveSignals,
    isLoading,
    isError,
    fallback,
    fallbackReason,
    total,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  } = useArchiveFeed({
    enabled: !datesInvalid,
    commodity: filters.commodity,
    region: filters.region,
    from: filters.from || null,
    to: filters.to || null,
    search: searchParam,
  });

  const extraRegions = useMemo(
    () => liveSignals.map((s) => s.region).filter(Boolean) as string[],
    [liveSignals],
  );
  const regionOptions = buildRegionOptions(extraRegions);

  const filtersActive =
    Boolean(filters.commodity) ||
    Boolean(filters.region) ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(searchParam);

  const applyDesk = (id: DeskPresetId) => {
    const asBar = {
      commodity: filters.commodity,
      region: filters.region,
      minSeverity: 1,
      window: null,
      minSources: 1,
      eventCategory: null,
    };
    if (deskMatchesFilters(id, asBar)) {
      setFilters((prev) => ({ ...prev, commodity: null, region: null }));
      return;
    }
    const preset = DESK_PRESETS[id];
    setFilters((prev) => ({
      ...prev,
      commodity: preset.commodity,
      region: preset.region,
    }));
  };

  const degraded = fallback ? feedDegradedCopy(fallbackReason) : null;

  return (
    <div className="p-8 md:p-10 min-h-screen bg-surface-container-lowest text-on-surface">
      <div className="max-w-4xl">
        <Breadcrumbs
          items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Archive" }]}
          className="mb-4"
        />
        <h1 className="text-4xl font-extrabold tracking-tighter font-headline text-white">
          Archive
        </h1>
        <p className="text-on-surface/60 mt-2 font-body font-medium">
          Jump to older signals by date, desk, region, or keyword. This list has
          no severity floor and no recency cutoff — unlike the Intelligence Feed.
        </p>

        {degraded && (
          <p
            className="mt-4 text-[12px] md:text-[11px]"
            style={{ color: "#86948a", fontFamily: "'Inter', sans-serif" }}
          >
            {degraded}
          </p>
        )}

        <form
          data-testid="archive-filters"
          className="mt-8 space-y-5"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label="Desk presets">
            {(Object.keys(DESK_PRESETS) as DeskPresetId[]).map((id) => {
              const preset = DESK_PRESETS[id];
              const selected = deskMatchesFilters(id, {
                commodity: filters.commodity,
                region: filters.region,
                minSeverity: 1,
                window: null,
                minSources: 1,
                eventCategory: null,
              });
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`archive-desk-${id}`}
                  aria-pressed={selected}
                  onClick={() => applyDesk(id)}
                  className="px-3 py-1.5 text-[12px] md:text-[11px] font-bold tracking-widest border transition-colors cursor-pointer inline-flex items-center min-h-[44px] md:min-h-0"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    backgroundColor: selected ? "#4edea3" : "#201f1f",
                    color: selected ? "#005f40" : "#bbcac0",
                    borderColor: selected ? "#4edea3" : "#3c4a42",
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="archive-from"
                className="text-[12px] md:text-[10px] uppercase tracking-wider"
                style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                From date
              </label>
              <input
                id="archive-from"
                data-testid="archive-from"
                type="date"
                value={filters.from}
                onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
                className={SELECT_CLASSES}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="archive-to"
                className="text-[12px] md:text-[10px] uppercase tracking-wider"
                style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                To date
              </label>
              <input
                id="archive-to"
                data-testid="archive-to"
                type="date"
                value={filters.to}
                onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
                className={SELECT_CLASSES}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="archive-commodity"
                className="text-[12px] md:text-[10px] uppercase tracking-wider"
                style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Commodity
              </label>
              <select
                id="archive-commodity"
                data-testid="archive-commodity"
                value={filters.commodity ?? ""}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, commodity: e.target.value || null }))
                }
                className={SELECT_CLASSES}
              >
                <option value="">All</option>
                {FILTER_CATEGORIES.map((c) => (
                  <option key={c.id} value={`${COMMODITY_CATEGORY_PREFIX}${c.id}`}>
                    {c.label}
                  </option>
                ))}
                {FILTER_COMMODITIES.map((c) => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="archive-region"
                className="text-[12px] md:text-[10px] uppercase tracking-wider"
                style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Region
              </label>
              <select
                id="archive-region"
                data-testid="archive-region"
                value={filters.region ?? ""}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, region: e.target.value || null }))
                }
                className={SELECT_CLASSES}
              >
                <option value="">All</option>
                {regionOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="archive-keyword"
              className="text-[12px] md:text-[10px] uppercase tracking-wider"
              style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Keyword
            </label>
            <input
              id="archive-keyword"
              data-testid="archive-keyword"
              type="search"
              value={filters.keyword}
              onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              placeholder="Search title or summary (3+ characters)"
              className={`${SELECT_CLASSES} font-sans normal-case tracking-normal`}
            />
            {filters.keyword.trim().length > 0 && filters.keyword.trim().length < 3 && (
              <p className="text-[12px] md:text-[11px] text-on-surface/45 font-mono">
                Type at least 3 characters to search.
              </p>
            )}
          </div>

          {datesInvalid && (
            <p
              data-testid="archive-date-error"
              className="text-[12px] md:text-[11px] text-[#ee7d77] font-mono"
            >
              From date is after To date.
            </p>
          )}

          {filtersActive && (
            <button
              type="button"
              data-testid="archive-clear"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="text-[12px] md:text-[11px] font-bold uppercase tracking-widest text-primary hover:underline cursor-pointer min-h-[44px] inline-flex items-center"
            >
              Clear filters
            </button>
          )}
        </form>

        <div className="mt-8 flex items-baseline gap-3">
          <h2 className="text-lg font-bold text-white font-headline">Results</h2>
          {typeof total === "number" && !isLoading && (
            <span
              className="text-[12px] md:text-[11px] font-mono"
              style={{ color: "#4edea3" }}
              data-testid="archive-total"
            >
              {total} signal{total === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {isLoading || isError ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-28 w-full bg-[#2a2a2a]" />
            <Skeleton className="h-28 w-full bg-[#2a2a2a]" />
            <Skeleton className="h-28 w-full bg-[#2a2a2a]" />
          </div>
        ) : liveSignals.length === 0 ? (
          <div className="py-20 text-center flex flex-col items-center gap-4">
            <span className="material-symbols-outlined text-4xl text-[#3c4a42]">
              search_off
            </span>
            <p
              className="text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {filtersActive
                ? "No signals matching these filters"
                : "No signals in the archive"}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {liveSignals.map((signal) => {
              const dated = signal.eventDate ?? signal.createdAt;
              let dateLabel = "";
              try {
                dateLabel = format(new Date(dated), "yyyy-MM-dd");
              } catch {
                dateLabel = "";
              }
              return (
                <div key={signal.id} data-testid="archive-result-row">
                  {dateLabel ? (
                    <div
                      className="mb-1.5 text-[12px] md:text-[11px] font-mono text-on-surface/45"
                      data-testid="archive-result-date"
                    >
                      {dateLabel}
                    </div>
                  ) : null}
                  <SignalCard
                    signal={signal}
                    variant="compact"
                    onClick={() => {
                      logUsageEvent("signal_viewed", signalEventMetadata(signal), false);
                      setQuickViewSignal(signal);
                    }}
                  />
                </div>
              );
            })}
            {hasNextPage && <div ref={sentinelRef} aria-hidden="true" />}
            <LoadMoreButton
              hasMore={hasNextPage}
              isLoading={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
              loadedCount={liveSignals.length}
              totalCount={total}
              endLabel="End of archive results"
            />
          </div>
        )}
      </div>

      {quickViewSignal && (
        <SignalQuickView
          signal={quickViewSignal}
          onClose={() => setQuickViewSignal(null)}
        />
      )}
    </div>
  );
}
