import assert from "node:assert/strict";
import { haversineDistanceKm } from "./geo-coords";

// Same point: distance is exactly 0.
assert.equal(haversineDistanceKm(51.5074, -0.1278, 51.5074, -0.1278), 0);

// London (51.5074, -0.1278) to Paris (48.8566, 2.3522) is ~344 km.
const londonToParis = haversineDistanceKm(51.5074, -0.1278, 48.8566, 2.3522);
assert.ok(
  Math.abs(londonToParis - 344) <= 5,
  `expected ~344 km, got ${londonToParis}`,
);

// Direction-independent.
const parisToLondon = haversineDistanceKm(48.8566, 2.3522, 51.5074, -0.1278);
assert.equal(londonToParis, parisToLondon);

console.log("geo-coords.test.ts ok");
