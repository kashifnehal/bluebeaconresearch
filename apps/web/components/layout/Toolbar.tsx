import type { ReactNode } from "react";
import { SELECT_CLASSES } from "@/lib/utils";

const LABEL_CLASS = "text-[12px] md:text-[10px] uppercase tracking-wider shrink-0";
const LABEL_STYLE = { color: "var(--text-muted)", fontFamily: "'Space Grotesk', sans-serif" };

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div data-testid="toolbar" className="flex flex-wrap items-end gap-3 mb-4">
      {children}
    </div>
  );
}

export function ToolbarSpacer({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex items-end gap-2">{children}</div>;
}

export type ActiveFilterChip = { id: string; label: string; onRemove: () => void };

export function ActiveFilters({
  chips,
  onClearAll,
}: {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Active filters"
      className="flex flex-wrap items-center gap-2"
      data-testid="active-filters"
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={chip.onRemove}
          aria-label={`Remove filter: ${chip.label}`}
          data-testid="active-filter-chip"
          className="flex items-center gap-1 px-2.5 py-1 text-[12px] md:text-[11px] font-mono border rounded-full cursor-pointer min-h-[32px]"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          {chip.label}
          <span aria-hidden="true">×</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        data-testid="active-filters-clear-all"
        className="text-[12px] md:text-[11px] font-bold uppercase tracking-widest text-primary hover:underline cursor-pointer min-h-[32px]"
      >
        Clear all
      </button>
    </div>
  );
}

export function SortSelect({
  value,
  options,
  onChange,
  label = "Sort",
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  label?: string;
  ariaLabel?: string;
}) {
  const id = `sort-select-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2">
      <label htmlFor={id} className={LABEL_CLASS} style={LABEL_STYLE}>
        {label}
      </label>
      <select
        id={id}
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full md:w-auto ${SELECT_CLASSES}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SegmentedControl({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex border"
      style={{ borderColor: "var(--border)" }}
      data-testid="segmented-control"
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className="px-3 py-1 text-[12px] md:text-[10px] font-bold uppercase tracking-widest cursor-pointer"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              backgroundColor: selected ? "var(--accent)" : "transparent",
              color: selected ? "#005f40" : "var(--text-muted)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
