export type Direction = "up" | "down" | "volatile" | "neutral";
export type PlanTier = "free" | "analyst" | "pro" | "api";
export type Region =
  | "middle-east"
  | "eastern-europe"
  | "africa"
  | "asia-pacific"
  | "americas"
  | "global";

// #141 CHECK enum on signals.source_confirmation. Display labels live in
// apps/web/lib/market-impact-assessment.ts. Sourcing *type*, not truth.
export type SourceConfirmation = "official" | "reported" | "speculative";

// #141 CHECK enum on signals.event_category. Display labels live in
// apps/web/lib/market-impact-assessment.ts (#143).
export type EventCategory =
  | "armed_conflict_security"
  | "supply_disruption_logistics"
  | "sanctions_trade_policy"
  | "production_output_decision"
  | "central_bank_monetary_policy"
  | "scheduled_economic_data"
  | "official_statement_commentary"
  | "elections_political_transition"
  | "other_market_relevant";

// Runtime counterpart to EventCategory, for callers that need to iterate or
// validate against the 9 values (e.g. the category-filter chips, API query
// param validation). `Record<EventCategory, true>` makes the compiler prove
// this list is exhaustive: adding, removing, or typo-ing a member of
// EventCategory without updating this object is a type error, not a
// silent mismatch caught only at runtime.
const EVENT_CATEGORY_EXHAUSTIVENESS_CHECK: Record<EventCategory, true> = {
  armed_conflict_security: true,
  supply_disruption_logistics: true,
  sanctions_trade_policy: true,
  production_output_decision: true,
  central_bank_monetary_policy: true,
  scheduled_economic_data: true,
  official_statement_commentary: true,
  elections_political_transition: true,
  other_market_relevant: true,
};

export const EVENT_CATEGORY_VALUES = Object.keys(
  EVENT_CATEGORY_EXHAUSTIVENESS_CHECK,
) as EventCategory[];

export interface CommodityImpact {
  asset: string;
  direction: Direction;
  confidence: number;
}

export interface Signal {
  id: string;
  title: string;
  summary: string;
  aiAnalysis?: string;
  severity: number;
  confidence: number;
  eventType: string;
  country: string;
  region: Region;
  lat?: number;
  lng?: number;
  sourcesCount: number;
  commodityImpacts: CommodityImpact[];
  // Forex-pair impacts (#87) — same {asset,direction,confidence} shape as
  // commodityImpacts, sourced from signals.currency_pair_impacts. Optional so
  // existing Signal constructors that predate the forex taxonomy stay valid.
  currencyPairImpacts?: CommodityImpact[];
  sanctionsMatches?: { actor: string; list: string }[];
  isBreaking: boolean;
  isActive: boolean;
  // Set by classifyEvent() going forward (`claude` | `heuristic`). Null on
  // pre-column rows that the 2026-09-12 backfill left unknown.
  classificationMethod?: "claude" | "heuristic" | null;
  // #142 — matched media_impact_watchlist.entity_name, or null. Describes a
  // sourced historical reaction pattern, not a forecast.
  mediaImpactEntity?: string | null;
  mediaImpactCaveat?: string | null;
  // #141/#143 — materiality-gate fields the UI now reads. Null on pre-gate
  // rows and on heuristic classifications that never computed them.
  eventCategory?: EventCategory | null;
  marketMechanism?: string | null;
  isPreview?: boolean;
  // 0–1 classifier novelty. Null on pre-gate / heuristic rows.
  novelty?: number | null;
  sourceConfirmation?: SourceConfirmation | null;
  materialityReasoning?: string | null;
  // #216 — one-sentence, plain-language statement of what specific reported
  // fact, if false/unconfirmed/different, would undercut this event's
  // market-impact assessment. Null on pre-column rows and on heuristic
  // classifications that never computed it. Surfaced in the UI on the event
  // detail page's Analysis tab only (a deliberate scope decision — keeps the
  // dense feed/card/drawer surfaces from growing another block of prose).
  invalidationCondition?: string | null;
  createdAt: string; // when WE ingested it
  eventDate?: string; // when the article/event was PUBLISHED
  updatedAt?: string; // last updated time for this signal record
}

export interface CommodityPrice {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  fetchedAt: string;
}
