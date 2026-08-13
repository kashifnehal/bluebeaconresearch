/**
 * Basemap configuration for MapLibre + OpenStreetMap tiles.
 * Keep this isolated so the intelligence layers do not depend on the basemap provider.
 */
// Provide explicit tile subdomain URLs so MapLibre makes concrete requests.
export const BASEMAP_TILE_URLS = [
  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
];

// Backwards-compatible single-template string (keep for docs/tests)
export const BASEMAP_TILE_URL = BASEMAP_TILE_URLS[0];

export const BASEMAP_ATTRIBUTION = "© OpenStreetMap contributors";

export const DEFAULT_MAP_CENTER: [number, number] = [0, 20];
export const DEFAULT_MAP_ZOOM = 1.2;
