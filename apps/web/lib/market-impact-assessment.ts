import type {
  CommodityImpact,
  Direction,
  EventCategory,
  Signal,
  SourceConfirmation,
} from "@blue-beacon-research/shared";

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  armed_conflict_security: "Armed Conflict & Security",
  supply_disruption_logistics: "Supply Disruption & Logistics",
  sanctions_trade_policy: "Sanctions & Trade Policy",
  production_output_decision: "Production & Output Decision",
  central_bank_monetary_policy: "Central Bank & Monetary Policy",
  scheduled_economic_data: "Scheduled Economic Data",
  official_statement_commentary: "Official Statement & Commentary",
  elections_political_transition: "Elections & Political Transition",
  other_market_relevant: "Other Market-Relevant",
};

const EVENT_CATEGORY_SET = new Set<string>(Object.keys(EVENT_CATEGORY_LABELS));

export function parseEventCategory(value: unknown): EventCategory | null {
  if (typeof value !== "string") return null;
  return EVENT_CATEGORY_SET.has(value) ? (value as EventCategory) : null;
}

export function eventCategoryLabel(
  value: EventCategory | string | null | undefined,
): string | null {
  const parsed = parseEventCategory(value);
  return parsed ? EVENT_CATEGORY_LABELS[parsed] : null;
}

export const SOURCE_CONFIRMATION_LABELS: Record<SourceConfirmation, string> = {
  official: "Official statement",
  reported: "Reported claim",
  speculative: "Speculative / unconfirmed",
};

const SOURCE_CONFIRMATION_SET = new Set<string>(
  Object.keys(SOURCE_CONFIRMATION_LABELS),
);

export function parseSourceConfirmation(
  value: unknown,
): SourceConfirmation | null {
  if (typeof value !== "string") return null;
  return SOURCE_CONFIRMATION_SET.has(value)
    ? (value as SourceConfirmation)
    : null;
}

export function sourceConfirmationLabel(
  value: SourceConfirmation | string | null | undefined,
): string | null {
  const parsed = parseSourceConfirmation(value);
  return parsed ? SOURCE_CONFIRMATION_LABELS[parsed] : null;
}

export function parseNovelty(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

// UI display buckets only — not researched thresholds. Labels must stay
// descriptive, not "score ≥ 0.7" / "70% new".
export function noveltyLabel(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value >= 0.7) return "New development";
  if (value >= 0.3) return "Partial update";
  return "Mostly a repeat/reminder";
}

export const GPR_FALLBACK_SENTENCE =
  "No direct commodity match. Broad geopolitical risk events like this have historically been associated with a 5-10% move in equity indices and reduced oil demand within the following weeks (Caldara & Iacoviello, 2022).";

export const PREVIEW_NOTE =
  "This is a preview of a scheduled event, not the event itself — see the Economic Calendar for the confirmed schedule";

const DIRECTION_LABELS: Record<Direction, string> = {
  up: "Up",
  down: "Down",
  volatile: "Volatile",
  neutral: "Neutral",
};

export function directionLabel(direction: Direction | string): string {
  return DIRECTION_LABELS[direction as Direction] ?? direction;
}

export function collectMarketImpacts(signal: Pick<
  Signal,
  "commodityImpacts" | "currencyPairImpacts"
>): CommodityImpact[] {
  return [
    ...(signal.commodityImpacts ?? []),
    ...(signal.currencyPairImpacts ?? []),
  ];
}

export function hasDirectMarketMatch(signal: Pick<
  Signal,
  "marketMechanism" | "commodityImpacts" | "currencyPairImpacts"
>): boolean {
  const mechanism =
    typeof signal.marketMechanism === "string" && signal.marketMechanism.trim()
      ? signal.marketMechanism.trim()
      : "";
  return mechanism.length > 0 || collectMarketImpacts(signal).length > 0;
}

export function usesGprFallback(signal: Pick<
  Signal,
  "marketMechanism" | "commodityImpacts" | "currencyPairImpacts"
>): boolean {
  return !hasDirectMarketMatch(signal);
}

export function formatImpactDirections(impacts: CommodityImpact[]): string | null {
  if (impacts.length === 0) return null;
  const unique = [...new Set(impacts.map((i) => i.direction))];
  if (unique.length === 1) return directionLabel(unique[0]);
  return impacts
    .map((i) => `${i.asset} ${directionLabel(i.direction)}`)
    .join(" · ");
}
