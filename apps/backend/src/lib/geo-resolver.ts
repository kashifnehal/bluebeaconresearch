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
  // Extended 2026-08-27 — real GDELT sourcecountry sample showed these appearing
  // regularly but falling through to the Sahara/global fallback (see geo-coords
  // gap fix). Centroids, same precision as the existing entries above.
  "india": [78.9629, 20.5937],
  "pakistan": [69.3451, 30.3753],
  "bangladesh": [90.3563, 23.6850],
  "canada": [-106.3468, 56.1304],
  "mexico": [-102.5528, 23.6345],
  "brazil": [-51.9253, -14.2350],
  "argentina": [-63.6167, -38.4161],
  "egypt": [30.8025, 26.8206],
  "south africa": [22.9375, -30.5595],
  "kenya": [37.9062, -0.0236],
  "ethiopia": [40.4897, 9.1450],
  "poland": [19.1451, 51.9194],
  "netherlands": [5.2913, 52.1326],
  "italy": [12.5674, 41.8719],
  "spain": [-3.7492, 40.4637],
  "greece": [21.8243, 39.0742],
  "new zealand": [174.8860, -40.9006],
  "jamaica": [-77.2975, 18.1096],
  "niger": [8.0817, 17.6078],
  "south sudan": [31.3070, 6.8770],
  "romania": [24.9668, 45.9432],
  "norway": [8.4689, 60.4720],
  "sweden": [18.6435, 60.1282],
  "denmark": [9.5018, 56.2639],
  "switzerland": [8.2275, 46.8182],
  "belgium": [4.4699, 50.5039],
  "austria": [14.5501, 47.5162],
  "portugal": [-8.2245, 39.3999],
  "ireland": [-8.2439, 53.4129],
  "vietnam": [108.2772, 14.0583],
  "thailand": [100.9925, 15.8700],
  "indonesia": [113.9213, -0.7893],
  "philippines": [121.7740, 12.8797],
  "malaysia": [101.9758, 4.2105],
  "qatar": [51.1839, 25.3548],
  "uae": [53.8478, 23.4241],
  "united arab emirates": [53.8478, 23.4241],
  "kuwait": [47.4818, 29.3117],
  "bahrain": [50.5577, 26.0667],
  "oman": [55.9754, 21.4735],
  "jordan": [36.2384, 30.5852],
  "lebanon": [35.8623, 33.8547],
  "afghanistan": [67.7100, 33.9391],
  "myanmar": [95.9560, 21.9162],
  "sri lanka": [80.7718, 7.8731],
  "nepal": [84.1240, 28.3949],
};

const REGION_MAP: Record<string, [number, number]> = {
  "middle-east": [42.5510, 29.2985],
  "eastern-europe": [31.1656, 48.3794],
  "asia-pacific": [120.9605, 23.6978],
  "africa": [16.4943, 1.6585],
  "americas": [-99.1332, 19.4326],
  "global": [10.0000, 25.0000],
};

export function resolveGeoCoords(title: string, country?: string | null, region?: string | null): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < (title || "").length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const jitterLat = ((Math.abs(hash) % 100) / 100 - 0.5) * 4;
  const jitterLng = (((Math.abs(hash) >> 2) % 100) / 100 - 0.5) * 4;

  const titleLower = (title || "").toLowerCase();
  const countryLower = (country || "").toLowerCase().trim();
  const regionLower = (region || "").toLowerCase().trim();

  // Title keywords
  if (titleLower.includes("red sea") || titleLower.includes("houthi") || titleLower.includes("bab al-mandab")) {
    return { lat: 20.2802 + jitterLat, lng: 38.5126 + jitterLng };
  }
  if (titleLower.includes("panama canal") || titleLower.includes("panama")) {
    return { lat: 8.9824 + jitterLat, lng: -79.5199 + jitterLng };
  }
  if (titleLower.includes("strait of hormuz") || titleLower.includes("hormuz")) {
    return { lat: 26.5667 + jitterLat, lng: 56.4533 + jitterLng };
  }
  if (titleLower.includes("black sea") || titleLower.includes("ukraine") || titleLower.includes("kyiv")) {
    return { lat: 48.3794 + jitterLat, lng: 31.1656 + jitterLng };
  }
  if (titleLower.includes("gaza") || titleLower.includes("israel") || titleLower.includes("lebanon")) {
    return { lat: 31.0461 + jitterLat, lng: 34.8516 + jitterLng };
  }

  if (countryLower && COUNTRY_MAP[countryLower]) {
    const [cLng, cLat] = COUNTRY_MAP[countryLower];
    return { lat: cLat + jitterLat, lng: cLng + jitterLng };
  }

  if (regionLower && REGION_MAP[regionLower]) {
    const [rLng, rLat] = REGION_MAP[regionLower];
    return { lat: rLat + jitterLat, lng: rLng + jitterLng };
  }

  return { lat: 25.0000 + jitterLat * 5, lng: 10.0000 + jitterLng * 5 };
}
