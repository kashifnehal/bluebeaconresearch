import type { Signal } from "@blue-beacon-research/shared";
import {
  COMMODITY_CATEGORY_PREFIX,
  DEFAULT_FILTERS,
  FILTER_CATEGORIES,
  FILTER_COMMODITIES,
  WINDOW_OPTIONS,
  buildRegionOptions,
  isCommodityCategoryValue,
  type FilterBarValue,
} from "@/lib/signal-filters";
import { eventCategoryChipLabel } from "@/lib/event-category-labels";
import { formatRegionLabel } from "@/lib/utils";

export type StreamSort = "relevance" | "newest" | "severity";

/**
 * Pure client-side re-ordering of the already-loaded signal stream (TASK
 * UI-ALL PART 6c) — does not touch useSignalFeed.ts or the /api/signals
 * route. "relevance" keeps the server's existing order untouched.
 */
export function sortStreamList(signals: Signal[], sort: StreamSort): Signal[] {
  if (sort === "relevance") return signals;
  const dateOf = (s: Signal) => new Date(s.eventDate ?? s.createdAt).getTime();
  if (sort === "newest") {
    return [...signals].sort((a, b) => {
      const diff = dateOf(b) - dateOf(a);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
  }
  return [...signals].sort((a, b) => {
    const diff = (b.severity ?? 0) - (a.severity ?? 0);
    return diff !== 0 ? diff : dateOf(b) - dateOf(a);
  });
}

export type ActiveFilterChipDescriptor = { id: string; label: string };

/**
 * Chip descriptors for every FilterBarValue field that differs from
 * DEFAULT_FILTERS (the same comparison the existing `filtersActive` logic
 * uses — note the default minSeverity is 4, not 1). Pure: the caller wires
 * each chip's onRemove.
 */
export function buildActiveFilterChips(filters: FilterBarValue): ActiveFilterChipDescriptor[] {
  const chips: ActiveFilterChipDescriptor[] = [];

  if (filters.commodity != null) {
    const label = isCommodityCategoryValue(filters.commodity)
      ? FILTER_CATEGORIES.find(
          (c) => `${COMMODITY_CATEGORY_PREFIX}${c.id}` === filters.commodity,
        )?.label ?? filters.commodity
      : FILTER_COMMODITIES.find((c) => c.symbol === filters.commodity)?.label ??
        filters.commodity;
    chips.push({ id: "commodity", label });
  }

  if (filters.region != null) {
    const label =
      buildRegionOptions([]).find((r) => r.id === filters.region)?.label ??
      formatRegionLabel(filters.region);
    chips.push({ id: "region", label });
  }

  if (filters.minSeverity !== DEFAULT_FILTERS.minSeverity) {
    chips.push({ id: "minSeverity", label: `Severity ≥ ${filters.minSeverity}` });
  }

  if (filters.minSources !== DEFAULT_FILTERS.minSources) {
    chips.push({ id: "minSources", label: `Reports ≥ ${filters.minSources}` });
  }

  if (filters.window != null) {
    const label = WINDOW_OPTIONS.find((w) => w.id === filters.window)?.label ?? filters.window;
    chips.push({ id: "window", label });
  }

  if (filters.eventCategory != null) {
    chips.push({ id: "eventCategory", label: eventCategoryChipLabel(filters.eventCategory) });
  }

  return chips;
}
