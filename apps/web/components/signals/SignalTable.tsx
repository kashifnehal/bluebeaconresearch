"use client";

import { useState } from "react";
import type { Signal } from "@blue-beacon-research/shared";
import { safeFormatDistanceToNow } from "@/lib/utils";
import { eventCategoryLabel } from "@/lib/market-impact-assessment";
import { SeverityBadge } from "./SeverityBadge";
import { CommodityChip } from "./CommodityChip";
import {
  formatTableCountLine,
  primaryTableImpact,
  sortSignalTableRows,
  tableCountLine,
  truncateSignalSummary,
  type SignalTableSortColumn,
  type SignalTableSortDirection,
} from "@/lib/signal-table";

function topicSymbols(signal: Signal): string {
  const assets = [
    ...(signal.commodityImpacts ?? []).map((c) => c.asset),
    ...(signal.currencyPairImpacts ?? []).map((c) => c.asset),
  ];
  return assets.length > 0 ? assets.join(", ") : "—";
}

/**
 * Dense table view of the feed (4.1) — an alternative to the card/row list,
 * toggled from the dashboard header. Client-side sort only, over whatever
 * rows are already loaded; reuses the dashboard's existing infinite-scroll
 * and Export CSV, which sit outside this component.
 */
export function SignalTable({
  signals,
  hideSummaries,
}: {
  signals: Signal[];
  hideSummaries: boolean;
}) {
  const [sortColumn, setSortColumn] = useState<SignalTableSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SignalTableSortDirection>("desc");

  const rows = sortSignalTableRows(signals, sortColumn, sortDirection);
  const countLine = formatTableCountLine(tableCountLine(signals));

  const handleSort = (column: SignalTableSortColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("desc");
      return;
    }
    setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pt-3">
        <p
          className="text-[12px] md:text-[11px]"
          style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          Sorting applies to loaded rows
        </p>
        <p
          data-testid="signal-table-count"
          className="text-[12px] md:text-[11px]"
          style={{ color: "var(--text-secondary)", fontFamily: "'IBM Plex Sans', sans-serif" }}
        >
          {countLine}
        </p>
      </div>
      {/* Horizontal scroll stays inside this container — the page itself
          must not scroll sideways at phone width. */}
      <div
        data-testid="signal-table-scroll"
        className="overflow-x-auto"
      >
        <table className="w-full min-w-[900px] text-left text-[12px] md:text-[11px]" data-testid="signal-table">
          <thead>
            <tr
              className="border-b"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)", fontFamily: "'IBM Plex Sans', sans-serif" }}
            >
              <HeaderCell label="Date" column="date" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 font-bold ">Event</th>
              {hideSummaries ? null : (
                <th className="px-4 py-3 font-bold " data-testid="signal-table-summary-header">
                  Summary
                </th>
              )}
              <th className="px-4 py-3 font-bold ">Type</th>
              <th className="px-4 py-3 font-bold ">Direction</th>
              <HeaderCell label="Severity" column="severity" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell label="Reports" column="reports" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 font-bold ">Topic</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "rgba(60,74,66,0.3)" }}>
            {rows.map((signal) => {
              const primaryImpact = primaryTableImpact(signal);
              const type = eventCategoryLabel(signal.eventCategory) ?? signal.eventType;
              return (
                <tr
                  key={signal.id}
                  data-testid="signal-table-row"
                  className="transition-colors hover:bg-[var(--bg-container)]"
                >
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-muted)", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    <a href={`/events/${signal.id}`} className="block">
                      {safeFormatDistanceToNow(signal.eventDate ?? signal.createdAt, { addSuffix: true })}
                    </a>
                  </td>
                  <td className="px-4 py-3 max-w-[280px]" style={{ color: "var(--text-primary)", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    <a href={`/events/${signal.id}`} className="block truncate hover:text-[var(--interactive)]">
                      {signal.title}
                    </a>
                  </td>
                  {hideSummaries ? null : (
                    <td
                      className="px-4 py-3 max-w-[320px]"
                      data-testid="signal-table-summary-cell"
                      style={{ color: "var(--text-secondary)", fontFamily: "'IBM Plex Sans', sans-serif" }}
                    >
                      <a href={`/events/${signal.id}`} className="block">
                        {truncateSignalSummary(signal.summary)}
                      </a>
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    <a href={`/events/${signal.id}`} className="block">
                      {type}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <a href={`/events/${signal.id}`} className="block">
                      {primaryImpact ? (
                        <CommodityChip
                          asset={primaryImpact.asset}
                          direction={primaryImpact.direction}
                          confidence={primaryImpact.confidence}
                        />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <a href={`/events/${signal.id}`} className="block">
                      <SeverityBadge score={signal.severity} />
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-secondary)", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    <a href={`/events/${signal.id}`} className="block">
                      {signal.sourcesCount}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-secondary)", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                    <a href={`/events/${signal.id}`} className="block">
                      {topicSymbols(signal)}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HeaderCell({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
}: {
  label: string;
  column: SignalTableSortColumn;
  sortColumn: SignalTableSortColumn | null;
  sortDirection: SignalTableSortDirection;
  onSort: (column: SignalTableSortColumn) => void;
}) {
  const active = sortColumn === column;
  return (
    <th className="px-4 py-3 font-bold ">
      <button
        type="button"
        data-testid={`signal-table-sort-${column}`}
        onClick={() => onSort(column)}
        aria-pressed={active}
        className="inline-flex items-center gap-1 cursor-pointer"
        style={{ color: active ? "var(--interactive)" : "inherit" }}
      >
        {label}
        {active ? <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </th>
  );
}
