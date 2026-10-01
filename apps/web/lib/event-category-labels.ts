import { EVENT_CATEGORY_VALUES, type EventCategory } from "@blue-beacon-research/shared";

/**
 * Plain-English chip labels for the category filter (CategoryChips.tsx).
 * Deliberately shorter/plainer than EVENT_CATEGORY_LABELS in
 * market-impact-assessment.ts (that one is event-detail prose; this one has
 * to fit on a pill). Each label is copy, not data — under 28 characters.
 */
export const EVENT_CATEGORY_CHIP_LABELS: Record<EventCategory, string> = {
  armed_conflict_security: "Conflict & security",
  supply_disruption_logistics: "Supply disruption",
  sanctions_trade_policy: "Sanctions & trade",
  production_output_decision: "Production decision",
  central_bank_monetary_policy: "Central bank policy",
  scheduled_economic_data: "Economic data",
  official_statement_commentary: "Official statement",
  elections_political_transition: "Elections & politics",
  other_market_relevant: "Other market-relevant",
};

/**
 * `event_category IS NULL` — about half of recent signals, nearly all older
 * ones (low classifier coverage, not a bug). Not a member of EventCategory:
 * it describes the absence of a category, not a 10th category.
 */
export const UNCATEGORIZED_LABEL = "Uncategorized";

export function eventCategoryChipLabel(
  value: EventCategory | "uncategorized" | null,
): string {
  if (value === null) return "All";
  if (value === "uncategorized") return UNCATEGORIZED_LABEL;
  return EVENT_CATEGORY_CHIP_LABELS[value];
}

export const EVENT_CATEGORY_CHIP_OPTIONS: {
  value: EventCategory | "uncategorized";
  label: string;
}[] = [
  ...EVENT_CATEGORY_VALUES.map((value) => ({
    value,
    label: EVENT_CATEGORY_CHIP_LABELS[value],
  })),
  { value: "uncategorized" as const, label: UNCATEGORIZED_LABEL },
];
