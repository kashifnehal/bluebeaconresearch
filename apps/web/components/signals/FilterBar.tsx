"use client";

import { SELECT_CLASSES } from "@/lib/utils";
import {
  KEYWORD_PRESETS,
  toggleKeywordPreset,
  type KeywordMode,
  type KeywordSelection,
} from "@/lib/keyword-presets";
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
  /** Keyword presets (dashboard and map). Omit both props to hide the row. */
  keywords?: KeywordSelection;
  onKeywordsChange?: (next: KeywordSelection) => void;
};

export function FilterBar({
  value,
  onChange,
  extraRegions = [],
  layout = "bar",
  className,
  keywords,
  onKeywordsChange,
}: FilterBarProps) {
  const regions = buildRegionOptions(extraRegions);
  const stacked = layout === "stack";

  const patch = (partial: Partial<FilterBarValue>) =>
    onChange({ ...value, ...partial });

  const fieldClass = stacked
    ? "flex flex-col gap-1"
    : "flex flex-col gap-1 md:flex-row md:items-center md:gap-2";
  const labelClass = stacked
    ? "label text-[12px] md:text-[10px] text-on-surface-variant "
    : "text-[12px] md:text-[10px] shrink-0";
  const labelStyle = stacked
    ? undefined
    : { color: "var(--text-muted)", fontFamily: "'IBM Plex Sans', sans-serif" };
  // Bar layout: full width on mobile so each select fills its grid cell (a long option
  // label like "East Asia / Korean Peninsula" was otherwise forcing the closed <select>
  // wide enough to break 3-across packing); back to auto/natural width at md+, unchanged.
  const selectClass = stacked
    ? `w-full ${SELECT_CLASSES}`
    : `w-full md:w-auto ${SELECT_CLASSES}`;

  return (
    <div
      data-testid="filter-bar"
      className={
        className ??
        (stacked
          ? "space-y-3"
          : "grid grid-cols-3 gap-3 items-end md:flex md:flex-wrap md:items-center")
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
        <label htmlFor="filter-min-sources" className={labelClass} style={labelStyle}>
          Min reports
        </label>
        <select
          id="filter-min-sources"
          data-testid="filter-min-sources"
          value={value.minSources}
          onChange={(e) => patch({ minSources: Number(e.target.value) })}
          className={selectClass}
        >
          {[...Array(10)].map((_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </div>

      <div className={`${fieldClass} ${stacked ? "" : "col-span-3 md:col-span-1"}`}>
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
                    ? `px-2 py-1 rounded text-[12px] md:text-[10px] ${
                        selected
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container/20"
                      }`
                    : "px-3 py-1.5 text-[12px] md:text-[11px] border transition-colors cursor-pointer inline-flex items-center min-h-[44px] md:min-h-0"
                }
                style={
                  stacked
                    ? undefined
                    : {
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        backgroundColor: selected ? "var(--interactive-bg)" : "var(--bg-container)",
                        color: selected ? "var(--on-interactive-bg)" : "var(--text-secondary)",
                        borderColor: selected ? "var(--interactive)" : "var(--border)",
                      }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      {keywords && onKeywordsChange ? (
        <div
          data-testid="keyword-presets"
          className={`${fieldClass} ${stacked ? "" : "col-span-3 md:col-span-1"}`}
        >
          <span className={labelClass} style={labelStyle}>
            Keywords
          </span>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Keyword presets">
            {KEYWORD_PRESETS.map((preset) => {
              const selected = keywords.presets.includes(preset.id);
              const empty = preset.words.length === 0;
              return (
                <button
                  key={preset.id}
                  type="button"
                  data-testid={`keyword-preset-${preset.id}`}
                  aria-pressed={selected}
                  aria-disabled={empty || undefined}
                  disabled={empty}
                  title={empty ? "No tracked terms for this preset yet" : preset.words.join(", ")}
                  onClick={() => onKeywordsChange(toggleKeywordPreset(keywords, preset.id))}
                  className="px-3 py-1.5 text-[12px] md:text-[11px] border transition-colors cursor-pointer inline-flex items-center min-h-[44px] md:min-h-0 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    backgroundColor: selected ? "var(--interactive-bg)" : "var(--bg-container)",
                    color: selected ? "var(--on-interactive-bg)" : "var(--text-secondary)",
                    borderColor: selected ? "var(--interactive)" : "var(--border)",
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
            <div
              role="group"
              aria-label="Match any or all keywords"
              data-testid="keyword-mode"
              className="ml-1 inline-flex border"
              style={{ borderColor: "var(--border)" }}
            >
              {(["any", "all"] as KeywordMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-testid={`keyword-mode-${mode}`}
                  aria-pressed={keywords.mode === mode}
                  onClick={() => onKeywordsChange({ ...keywords, mode })}
                  className="px-2 py-1.5 text-[12px] md:text-[11px] cursor-pointer min-h-[44px] md:min-h-0"
                  style={{
                    backgroundColor: keywords.mode === mode ? "var(--interactive-bg)" : "transparent",
                    color: keywords.mode === mode ? "var(--on-interactive-bg)" : "var(--text-secondary)",
                  }}
                >
                  {mode === "any" ? "Any" : "All"}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
