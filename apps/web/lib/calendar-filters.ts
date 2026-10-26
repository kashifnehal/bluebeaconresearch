export type CalendarImpact = "high" | "medium" | "low";

// The "importance" (high/medium/low) filter and its UI control were removed
// 2026-10-26: _meta in economic-calendar.json has no documented method for
// how the impact field is assigned, so filtering/displaying by it would
// present an unsubstantiated rating as fact. The `impact` field itself stays
// on CalendarEvent and in the JSON for when a documented method exists.
export type CalendarFilterValue = {
  country: string;
  category: string;
};

export const EMPTY_CALENDAR_FILTERS: CalendarFilterValue = {
  country: "",
  category: "",
};

export function eventMatchesCalendarFilters(
  event: { country: string; category: string },
  filters: CalendarFilterValue,
): boolean {
  if (filters.country && event.country !== filters.country) return false;
  if (filters.category && event.category !== filters.category) return false;
  return true;
}

/**
 * Which of the forecast/previous/actual columns have at least one non-null
 * value across the loaded event list. A column with no values anywhere is
 * dropped (header and cells) rather than shown as a wall of em dashes.
 */
export function visibleValueColumns(
  events: { forecast: unknown; previous: unknown; actual: unknown }[],
): { forecast: boolean; previous: boolean; actual: boolean } {
  return {
    forecast: events.some((e) => e.forecast != null),
    previous: events.some((e) => e.previous != null),
    actual: events.some((e) => e.actual != null),
  };
}

