export type LngLat = { lng: number; lat: number };

/** True when every point is the same place, so zooming cannot split the cluster. */
export function pointsShareCoordinate(points: readonly LngLat[], epsilon = 1e-5): boolean {
  if (points.length < 2) return false;
  const origin = points[0];
  if (!Number.isFinite(origin.lng) || !Number.isFinite(origin.lat)) return false;
  return points.every(
    (point) =>
      Number.isFinite(point.lng) &&
      Number.isFinite(point.lat) &&
      Math.abs(point.lng - origin.lng) <= epsilon &&
      Math.abs(point.lat - origin.lat) <= epsilon,
  );
}

export function leafCoordinates(
  leaves: readonly { geometry?: { coordinates?: readonly number[] } }[],
): LngLat[] {
  return leaves.map((leaf) => ({
    lng: Number(leaf.geometry?.coordinates?.[0]),
    lat: Number(leaf.geometry?.coordinates?.[1]),
  }));
}
