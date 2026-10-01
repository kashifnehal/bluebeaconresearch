import { COMMODITIES } from "./commodities";

// Enforces that every symbol listed under a chokepoint's `commodities` array
// is a real member of COMMODITIES — a typo or a retired symbol fails the
// shared package's type check instead of silently rendering nothing on the map.
export type ChokepointCommoditySymbol = (typeof COMMODITIES)[number]["symbol"];

export interface Chokepoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  // Plain membership only — which COMMODITIES this chokepoint's traffic
  // includes. Not a relevance weight or score; editorial judgement, sourced
  // per-entry in the comment above each one below.
  commodities: ChokepointCommoditySymbol[];
}

export const CHOKEPOINTS: Chokepoint[] = [
  // Source: U.S. EIA, World Oil Transit Chokepoints — Hormuz carries roughly
  // a fifth of global oil consumption plus a large share of global LNG
  // (Qatar) exports.
  {
    id: "strait-of-hormuz",
    name: "Strait of Hormuz",
    lat: 26.6,
    lng: 56.25,
    commodities: ["USOIL", "UKOIL", "NGAS"],
  },
  // Source: U.S. EIA, World Oil Transit Chokepoints — the main deep-water
  // route for Middle East crude and LNG bound for East Asia.
  {
    id: "strait-of-malacca",
    name: "Strait of Malacca",
    lat: 2.5,
    lng: 101.0,
    commodities: ["USOIL", "UKOIL", "NGAS"],
  },
  // Source: U.S. EIA, World Oil Transit Chokepoints — the canal plus the
  // SUMED pipeline carry crude, refined products, and LNG between the
  // Persian Gulf/Red Sea and the Mediterranean.
  {
    id: "suez-canal",
    name: "Suez Canal",
    lat: 30.5,
    lng: 32.35,
    commodities: ["USOIL", "UKOIL", "NGAS"],
  },
  // EIA World Oil Transit Chokepoints reports LNG through Bab el-Mandeb at
  // about 0.0 Bcf/d in 1H25; no source for gas here. Oil: U.S. EIA, World
  // Oil Transit Chokepoints — Red Sea gateway for Gulf crude bound for the
  // Suez Canal and the Mediterranean.
  {
    id: "bab-el-mandeb",
    name: "Bab-el-Mandeb",
    lat: 12.5,
    lng: 43.3,
    commodities: ["USOIL", "UKOIL"],
  },
  // Source: U.S. EIA, World Oil Transit Chokepoints, last updated March 3,
  // 2026 — FY2025: more than 2.3 million b/d petroleum and other liquids
  // (about 2.2 million b/d refined products) transited the Panama Canal.
  // LNG flow exists but small (fell to less than 0.3 Bcf/d in FY2025 from
  // about 2.5 Bcf/d in FY2021); NGAS not added, founder decision pending.
  // No grain/corn/wheat data on this page — CORN/WHEAT not added.
  {
    id: "panama-canal",
    name: "Panama Canal",
    lat: 8.9824,
    lng: -79.5199,
    commodities: ["USOIL", "UKOIL"],
  },
  // Source: U.S. EIA, World Oil Transit Chokepoints, last updated March 3,
  // 2026 — 1H25: Bosporus carried 3.3 million b/d crude oil and condensate
  // plus 1.3 million b/d petroleum products; Dardanelles carried 3.7
  // million b/d crude oil and petroleum products.
  // LNG flow exists but small (Dardanelles LNG 0.6 Bcf/d, 1H25); NGAS not
  // added, founder decision pending.
  // No grain/corn/wheat data on this page — CORN/WHEAT not added.
  {
    id: "turkish-straits",
    name: "Turkish Straits (Bosphorus/Dardanelles)",
    lat: 41.01,
    lng: 29.06,
    commodities: ["USOIL", "UKOIL"],
  },
  // No source found for a chokepoint-to-commodity link here — EIA's "World
  // Oil Transit Chokepoints" report does not list Gibraltar (it is wide
  // enough that it isn't treated as a bottleneck), and no other
  // commodity-specific source was found. Left with an empty commodities list
  // rather than a guessed one.
  {
    id: "strait-of-gibraltar",
    name: "Strait of Gibraltar",
    lat: 35.95,
    lng: -5.6,
    commodities: [],
  },
  // Source: U.S. EIA, World Oil Transit Chokepoints — Baltic crude and
  // product exports (e.g. Russia's Primorsk/Ust-Luga terminals) transiting
  // to the North Sea and onward to global markets.
  {
    id: "danish-straits",
    name: "Danish Straits",
    lat: 55.5,
    lng: 11.5,
    commodities: ["USOIL", "UKOIL"],
  },
];
