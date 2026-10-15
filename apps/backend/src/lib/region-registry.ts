export const CANONICAL_REGION_IDS = [
  "middle-east",
  "eastern-europe",
  "europe",
  "north-america",
  "south-america",
  "asia-pacific",
  "africa",
  "global",
] as const;

export type CanonicalRegionId = (typeof CANONICAL_REGION_IDS)[number];

export const CANONICAL_REGIONS: ReadonlyArray<{ id: CanonicalRegionId; label: string }> = [
  { id: "middle-east", label: "Middle East" },
  { id: "eastern-europe", label: "Eastern Europe" },
  { id: "europe", label: "Europe" },
  { id: "north-america", label: "North America" },
  { id: "south-america", label: "South America" },
  { id: "asia-pacific", label: "Asia-Pacific" },
  { id: "africa", label: "Africa" },
  { id: "global", label: "Global" },
];

export const LEGACY_REGION_IDS = ["americas"] as const;
