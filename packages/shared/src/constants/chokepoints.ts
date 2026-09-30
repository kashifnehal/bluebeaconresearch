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
  // Source: U.S. EIA "World Oil Transit Chokepoints" — Hormuz carries roughly
  // a fifth of global oil consumption plus a large share of global LNG
  // (Qatar) exports.
  {
    id: "strait-of-hormuz",
    name: "Strait of Hormuz",
    lat: 26.6,
    lng: 56.25,
    commodities: ["USOIL", "UKOIL", "NGAS"],
  },
  // Source: U.S. EIA "World Oil Transit Chokepoints" — the main deep-water
  // route for Middle East crude and LNG bound for East Asia.
  {
    id: "strait-of-malacca",
    name: "Strait of Malacca",
    lat: 2.5,
    lng: 101.0,
    commodities: ["USOIL", "UKOIL", "NGAS"],
  },
  // Source: U.S. EIA "World Oil Transit Chokepoints" — the canal plus the
  // SUMED pipeline carry crude, refined products, and LNG between the
  // Persian Gulf/Red Sea and the Mediterranean.
  {
    id: "suez-canal",
    name: "Suez Canal",
    lat: 30.5,
    lng: 32.35,
    commodities: ["USOIL", "UKOIL", "NGAS"],
  },
  // Source: U.S. EIA "World Oil Transit Chokepoints" — Red Sea gateway for
  // Gulf crude and LNG headed to the Suez Canal and the Mediterranean.
  {
    id: "bab-el-mandeb",
    name: "Bab-el-Mandeb",
    lat: 12.5,
    lng: 43.3,
    commodities: ["USOIL", "UKOIL", "NGAS"],
  },
  // Source: U.S. EIA "World Oil Transit Chokepoints" (LNG route to Asia) and
  // USDA / Panama Canal Authority grain-transit reporting (U.S. corn and
  // soybean exports). No confident source was found tying Hormuz-scale crude
  // oil transit volumes to this chokepoint, so USOIL/UKOIL are left out here.
  {
    id: "panama-canal",
    name: "Panama Canal",
    lat: 8.9824,
    lng: -79.5199,
    commodities: ["NGAS", "CORN"],
  },
  // Source: U.S. EIA "World Oil Transit Chokepoints" (Russian/Caspian crude
  // export route) and USDA Black Sea grain-export reporting (Ukraine and
  // Russia wheat/corn shipped out through the Bosphorus).
  {
    id: "turkish-straits",
    name: "Turkish Straits (Bosphorus/Dardanelles)",
    lat: 41.01,
    lng: 29.06,
    commodities: ["USOIL", "UKOIL", "WHEAT", "CORN"],
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
  // Source: U.S. EIA "World Oil Transit Chokepoints" — Baltic crude and
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
