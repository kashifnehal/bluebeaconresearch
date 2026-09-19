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
