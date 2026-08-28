/**
 * Basemap configuration for MapLibre.
 *
 * CARTO's anonymous `basemaps.cartocdn.com/dark_all` raster CDN (previously used here)
 * now returns a watermarked "API KEY REQUIRED" tile on every request — confirmed live by
 * curling the tile URL directly, with no app code in the path. CARTO gated free anonymous
 * raster tile access account-wide; this project never had a CARTO API key configured (there
 * is no CARTO_API_KEY/similar anywhere in env or code), so this isn't an expired key or a
 * usage cap tied to our traffic — the always-free anonymous tier itself was deprecated.
 * Switched to Esri's World_Dark_Gray_Base service, which is free, requires no API key or
 * signup, and is intended for exactly this "dark canvas basemap" use case. Revisit if the
 * team later wants a CARTO account (paid) for closer visual parity with the old style.
 */
export const BASEMAP_TILE_URLS = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
];

// Backwards-compatible single-template string
export const BASEMAP_TILE_URL = BASEMAP_TILE_URLS[0];

export const BASEMAP_ATTRIBUTION = "© Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community";

export const DEFAULT_MAP_CENTER: [number, number] = [0, 20];
export const DEFAULT_MAP_ZOOM = 1.8;
