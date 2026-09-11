"use client";

import { SELECT_CLASSES } from "@/lib/utils";
import {
  FILTER_CATEGORIES,
  FILTER_COMMODITIES,
  WINDOW_OPTIONS,
  buildRegionOptions,
  COMMODITY_CATEGORY_PREFIX,
  type FilterBarValue,
} from "@/lib/signal-filters";

export type { FilterBarValue };

type FilterBarProps = {
  value: FilterBarValue;
  onChange: (next: FilterBarValue) => void;
  /** Raw `signals.region` values from the current feed — normalized/deduped for display. */
  extraRegions?: string[];
  /** `bar` = dashboard horizontal row; `stack` = map sidebar. */
  layout?: "bar" | "stack";
  className?: string;
};

export function FilterBar({
  value,
  onChange,
  extraRegions = [],
  layout = "bar",
  className,
}: FilterBarProps) {
  const regions = buildRegionOptions(extraRegions);
  const stacked = layout === "stack";

  const patch = (partial: Partial<FilterBarValue>) =>
    onChange({ ...value, ...partial });

  const fieldClass = stacked ? "flex flex-col gap-1" : "flex items-center gap-2";
  const labelClass = stacked
    ? "label text-[10px] text-on-surface-variant uppercase tracking-wider"
    : "text-[10px] uppercase tracking-wider shrink-0";
  const labelStyle = stacked
    ? undefined
    : { color: "#86948a", fontFamily: "'Space Grotesk', sans-serif" };
  const selectClass = stacked
    ? `w-full ${SELECT_CLASSES}`
    : SELECT_CLASSES;

  return (
    <div
      data-testid="filter-bar"
      className={
        className ??
        (stacked
          ? "space-y-3"
          : "flex flex-wrap gap-3 items-center")
      }
    >
      <div className={fieldClass}>
        <label htmlFor="filter-commodity" className={labelClass} style={labelStyle}>
          Commodity
        </label>
        <select
          id="filter-commodity"
          data-testid="filter-commodity"
          value={value.commodity ?? ""}
          onChange={(e) => patch({ commodity: e.target.value || null })}
          className={selectClass}
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

      <div className={fieldClass}>
        <label htmlFor="filter-region" className={labelClass} style={labelStyle}>
          Region
        </label>
        <select
          id="filter-region"
          data-testid="filter-region"
          value={value.region ?? ""}
          onChange={(e) => patch({ region: e.target.value || null })}
          className={selectClass}
        >
          <option value="">All</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className={fieldClass}>
        <label htmlFor="filter-severity" className={labelClass} style={labelStyle}>
          Min severity
        </label>
        <select
          id="filter-severity"
          data-testid="filter-severity"
          value={value.minSeverity}
          onChange={(e) => patch({ minSeverity: Number(e.target.value) })}
          className={selectClass}
        >
          {[...Array(10)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>

      <div className={fieldClass}>
        <span className={labelClass} style={labelStyle}>
          Time range
        </span>
        <div className="flex gap-1" role="group" aria-label="Time range">
          {WINDOW_OPTIONS.map((opt) => {
            const selected = value.window === opt.id;
            return (
              <button
                key={opt.label}
                type="button"
                data-testid={`filter-window-${opt.id ?? "all"}`}
                aria-pressed={selected}
                onClick={() => patch({ window: opt.id })}
                className={
                  stacked
                    ? `px-2 py-1 rounded text-[10px] ${
                        selected
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container/20"
                      }`
                    : "px-3 py-1.5 text-[11px] font-bold tracking-widest border transition-colors cursor-pointer"
                }
                style={
                  stacked
                    ? undefined
                    : {
                        fontFamily: "'Space Grotesk', sans-serif",
                        backgroundColor: selected ? "#4edea3" : "#201f1f",
                        color: selected ? "#005f40" : "#bbcac0",
                        borderColor: selected ? "#4edea3" : "#3c4a42",
                      }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
