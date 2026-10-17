"use client";

import type { EventCategory } from "@blue-beacon-research/shared";
import { EVENT_CATEGORY_CHIP_OPTIONS } from "@/lib/event-category-labels";

export type CategoryChipValue = EventCategory | "uncategorized" | null;

type CategoryChipsProps = {
  value: CategoryChipValue;
  onChange: (next: CategoryChipValue) => void;
  className?: string;
};

/**
 * Single-select category filter chips (4.2) — "All" + the 9 EventCategory
 * values + "Uncategorized" (event_category IS NULL). Dashboard only: the map
 * page shares FilterBarValue but never renders this row.
 */
export function CategoryChips({ value, onChange, className }: CategoryChipsProps) {
  const options: { testKey: string; chipValue: CategoryChipValue; label: string }[] = [
    { testKey: "all", chipValue: null, label: "All" },
    ...EVENT_CATEGORY_CHIP_OPTIONS.map((opt) => ({
      testKey: opt.value,
      chipValue: opt.value,
      label: opt.label,
    })),
  ];

  return (
    <div
      data-testid="category-chips"
      role="group"
      aria-label="Category"
      className={className ?? "flex flex-wrap gap-1.5"}
    >
      {options.map((opt) => {
        const selected = value === opt.chipValue;
        return (
          <button
            key={opt.testKey}
            type="button"
            data-testid={`category-chip-${opt.testKey}`}
            aria-pressed={selected}
            onClick={() => onChange(opt.chipValue)}
            className="px-3 py-1.5 text-[12px] md:text-[11px] border transition-colors cursor-pointer inline-flex items-center min-h-[36px] md:min-h-0"
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              backgroundColor: selected ? "var(--interactive-bg)" : "var(--bg-container)",
              color: selected ? "var(--on-interactive-bg)" : "var(--text-secondary)",
              borderColor: selected ? "var(--interactive)" : "var(--border)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
