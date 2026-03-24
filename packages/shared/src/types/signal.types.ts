export type Direction = "up" | "down" | "volatile" | "neutral";
export type PlanTier = "free" | "analyst" | "pro" | "api";
export type Region =
  | "middle-east"
  | "eastern-europe"
  | "africa"
  | "asia-pacific"
  | "americas"
  | "global";

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
  sanctionsMatches?: { actor: string; list: string }[];
  isBreaking: boolean;
  isActive: boolean;
  createdAt: string;
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

