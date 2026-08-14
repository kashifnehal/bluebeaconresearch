import type { Signal } from "@blue-beacon-research/shared";

const COUNTRY_MAP: Record<string, [number, number]> = {
  "united states": [-95.7129, 37.0902],
  "usa": [-95.7129, 37.0902],
  "us": [-95.7129, 37.0902],
  "colombia": [-74.2973, 4.5709],
  "ukraine": [31.1656, 48.3794],
  "russia": [105.3188, 61.5240],
  "china": [104.1954, 35.8617],
  "taiwan": [120.9605, 23.6978],
  "israel": [34.8516, 31.0461],
  "palestine": [35.2332, 31.9522],
  "gaza": [34.3088, 31.3547],
  "iran": [53.6880, 32.4279],
  "iraq": [43.6793, 33.2232],
  "syria": [38.9968, 34.8021],
  "yemen": [48.5164, 15.5527],
  "turkey": [35.2433, 38.9637],
  "türkiye": [35.2433, 38.9637],
  "germany": [10.4515, 51.1657],
  "france": [2.2137, 46.2276],
  "united kingdom": [-3.4360, 55.3781],
  "uk": [-3.4360, 55.3781],
  "bulgaria": [25.4858, 42.7339],
  "libya": [17.2283, 26.3351],
  "australia": [133.7751, -25.2744],
  "rwanda": [29.8739, -1.9403],
  "japan": [138.2529, 36.2048],
  "south korea": [127.7669, 35.9078],
  "north korea": [127.5101, 40.3399],
  "saudi arabia": [45.0792, 23.8859],
  "venezuela": [-66.5897, 6.4238],
  "nigeria": [8.6753, 9.0820],
  "sudan": [30.2176, 12.8628],
  "somalia": [46.1996, 5.1521],
};

const REGION_MAP: Record<string, [number, number]> = {
  "middle-east": [42.5510, 29.2985],
  "eastern-europe": [31.1656, 48.3794],
  "asia-pacific": [120.9605, 23.6978],
  "africa": [16.4943, 1.6585],
  "americas": [-99.1332, 19.4326],
  "global": [10.0000, 25.0000],
};

/**
 * Returns [lng, lat] for any signal. If signal.lat and signal.lng exist, uses them.
 * Otherwise resolves coordinates from country/region/title keywords with a deterministic pseudo-random offset
 * so signals from the same country do not stack on top of each other.
 */
export function getSignalCoordinates(s: Partial<Signal>): [number, number] {
  if (
    typeof s.lat === "number" &&
    typeof s.lng === "number" &&
    isFinite(s.lat) &&
    isFinite(s.lng) &&
    s.lat >= -90 &&
    s.lat <= 90 &&
    s.lng >= -180 &&
    s.lng <= 180 &&
    (s.lat !== 0 || s.lng !== 0)
  ) {
    return [s.lng, s.lat];
  }

  // Deterministic jitter based on signal ID so pins in the same country scatter naturally
  let hash = 0;
  const idStr = s.id || s.title || "signal";
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash << 5) - hash + idStr.charCodeAt(i);
    hash |= 0;
  }
  const jitterLat = ((Math.abs(hash) % 100) / 100 - 0.5) * 4; // ±2.0 deg
  const jitterLng = (((Math.abs(hash) >> 2) % 100) / 100 - 0.5) * 4; // ±2.0 deg

  const countryLower = (s.country || "").toLowerCase().trim();
  const regionLower = (s.region || "").toLowerCase().trim();
  const titleLower = (s.title || "").toLowerCase();

  // 1. Check title keywords
  if (titleLower.includes("red sea") || titleLower.includes("houthi") || titleLower.includes("bab al-mandab")) {
    return [38.5126 + jitterLng, 20.2802 + jitterLat];
  }
  if (titleLower.includes("panama canal") || titleLower.includes("panama")) {
    return [-79.5199 + jitterLng, 8.9824 + jitterLat];
  }
  if (titleLower.includes("strait of hormuz") || titleLower.includes("hormuz")) {
    return [56.4533 + jitterLng, 26.5667 + jitterLat];
  }
  if (titleLower.includes("black sea") || titleLower.includes("ukraine") || titleLower.includes("kyiv")) {
    return [31.1656 + jitterLng, 48.3794 + jitterLat];
  }
  if (titleLower.includes("gaza") || titleLower.includes("israel") || titleLower.includes("lebanon") || titleLower.includes("beirut")) {
    return [34.8516 + jitterLng, 31.0461 + jitterLat];
  }
  if (titleLower.includes("iran") || titleLower.includes("tehran")) {
    return [53.6880 + jitterLng, 32.4279 + jitterLat];
  }
  if (titleLower.includes("turkey") || titleLower.includes("türkiye") || titleLower.includes("ankara")) {
    return [35.2433 + jitterLng, 38.9637 + jitterLat];
  }

  // 2. Country dictionary lookup
  if (countryLower && COUNTRY_MAP[countryLower]) {
    const [cLng, cLat] = COUNTRY_MAP[countryLower];
    return [cLng + jitterLng, cLat + jitterLat];
  }

  // 3. Region dictionary lookup
  if (regionLower && REGION_MAP[regionLower]) {
    const [rLng, rLat] = REGION_MAP[regionLower];
    return [rLng + jitterLng, rLat + jitterLat];
  }

  // 4. Default global fallback
  return [10.0000 + jitterLng * 5, 25.0000 + jitterLat * 5];
}
