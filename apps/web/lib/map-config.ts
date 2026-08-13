/**
 * Basemap configuration for MapLibre + OpenStreetMap tiles.
 * Keep this isolated so the intelligence layers do not depend on the basemap provider.
 */
export const BASEMAP_TILE_URL =
  "https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export const BASEMAP_ATTRIBUTION = "© OpenStreetMap contributors";

export const DEFAULT_MAP_CENTER: [number, number] = [0, 20];
export const DEFAULT_MAP_ZOOM = 1.2;
