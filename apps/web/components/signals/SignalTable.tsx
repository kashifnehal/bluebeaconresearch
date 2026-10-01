"use client";

import { useState } from "react";
import type { Signal } from "@blue-beacon-research/shared";
import { safeFormatDistanceToNow } from "@/lib/utils";
import { eventCategoryLabel } from "@/lib/market-impact-assessment";
import { SeverityBadge } from "./SeverityBadge";
import { CommodityChip } from "./CommodityChip";
import {
  sortSignalTableRows,
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
export function SignalTable({ signals }: { signals: Signal[] }) {
  const [sortColumn, setSortColumn] = useState<SignalTableSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SignalTableSortDirection>("desc");

  const rows = sortSignalTableRows(signals, sortColumn, sortDirection);

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
      <p
        className="px-4 pt-3 text-[12px] md:text-[11px]"
        style={{ color: "#86948a", fontFamily: "'Inter', sans-serif" }}
      >
        Sorting applies to loaded rows
      </p>
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
              style={{ borderColor: "#3c4a42", color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <HeaderCell label="Date" column="date" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 font-bold uppercase tracking-widest">Event</th>
              <th className="px-4 py-3 font-bold uppercase tracking-widest">Summary</th>
              <th className="px-4 py-3 font-bold uppercase tracking-widest">Type</th>
              <th className="px-4 py-3 font-bold uppercase tracking-widest">Direction</th>
              <HeaderCell label="Severity" column="severity" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <HeaderCell label="Reports" column="reports" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th className="px-4 py-3 font-bold uppercase tracking-widest">Topic</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "rgba(60,74,66,0.3)" }}>
            {rows.map((signal) => {
              const primaryImpact = signal.commodityImpacts?.[0] ?? signal.currencyPairImpacts?.[0];
              const type = eventCategoryLabel(signal.eventCategory) ?? signal.eventType;
              return (
                <tr
                  key={signal.id}
                  data-testid="signal-table-row"
                  className="transition-colors hover:bg-[#1f1f1f]"
                >
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#86948a", fontFamily: "'JetBrains Mono', monospace" }}>
                    <a href={`/events/${signal.id}`} className="block">
                      {safeFormatDistanceToNow(signal.eventDate ?? signal.createdAt, { addSuffix: true })}
                    </a>
                  </td>
                  <td className="px-4 py-3 max-w-[280px]" style={{ color: "#e5e2e1", fontFamily: "'Inter', sans-serif" }}>
                    <a href={`/events/${signal.id}`} className="block truncate hover:text-[#4edea3]">
                      {signal.title}
                    </a>
                  </td>
                  <td className="px-4 py-3 max-w-[320px]" style={{ color: "#bbcac0", fontFamily: "'Inter', sans-serif" }}>
                    <a href={`/events/${signal.id}`} className="block">
                      {truncateSignalSummary(signal.summary)}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#bbcac0" }}>
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
                        <span style={{ color: "#86948a" }}>—</span>
                      )}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <a href={`/events/${signal.id}`} className="block">
                      <SeverityBadge score={signal.severity} />
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#bbcac0", fontFamily: "'JetBrains Mono', monospace" }}>
                    <a href={`/events/${signal.id}`} className="block">
                      {signal.sourcesCount}
                    </a>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#bbcac0", fontFamily: "'JetBrains Mono', monospace" }}>
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
    <th className="px-4 py-3 font-bold uppercase tracking-widest">
      <button
        type="button"
        data-testid={`signal-table-sort-${column}`}
        onClick={() => onSort(column)}
        aria-pressed={active}
        className="inline-flex items-center gap-1 cursor-pointer"
        style={{ color: active ? "#4edea3" : "inherit" }}
      >
        {label}
        {active ? <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </th>
  );
}
