export type CalendarImpact = "high" | "medium" | "low";

export type CalendarFilterValue = {
  importance: CalendarImpact | "";
  country: string;
  category: string;
};

export const EMPTY_CALENDAR_FILTERS: CalendarFilterValue = {
  importance: "",
  country: "",
  category: "",
};

export function eventMatchesCalendarFilters(
  event: { impact: CalendarImpact; country: string; category: string },
  filters: CalendarFilterValue,
): boolean {
  if (filters.importance && event.impact !== filters.importance) return false;
  if (filters.country && event.country !== filters.country) return false;
  if (filters.category && event.category !== filters.category) return false;
  return true;
}
