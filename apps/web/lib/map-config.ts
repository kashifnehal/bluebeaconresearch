/**
 * Basemap configuration for MapLibre + OpenStreetMap / CartoDB Dark tiles.
 * Uses free CartoDB Dark Matter vector/raster tiles designed for dark mode UI dashboards.
 */
export const BASEMAP_TILE_URLS = [
  "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
];

// Backwards-compatible single-template string
export const BASEMAP_TILE_URL = BASEMAP_TILE_URLS[0];

export const BASEMAP_ATTRIBUTION = "© OpenStreetMap contributors, © CARTO";

export const DEFAULT_MAP_CENTER: [number, number] = [0, 20];
export const DEFAULT_MAP_ZOOM = 1.8;
