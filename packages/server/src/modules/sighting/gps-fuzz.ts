/**
 * GPS Fuzzing Utility
 * Adds random offset to GPS coordinates to protect cat colony locations.
 *
 * TODO: Implement coordinate fuzzing
 * - Add random offset within configured radius (default 200m)
 * - Ensure fuzzed coordinates are still valid lat/lng
 * - Use consistent fuzzing per cat (deterministic seed from catId)
 */

export interface FuzzedCoordinates {
  fuzzedLat: number;
  fuzzedLng: number;
}

/**
 * Fuzz GPS coordinates by adding random offset within a radius.
 * @param lat - Original latitude
 * @param lng - Original longitude
 * @param radiusMeters - Maximum offset radius in meters
 */
export function fuzzCoordinates(lat: number, lng: number, radiusMeters: number = 200): FuzzedCoordinates {
  // TODO: Implement proper GPS fuzzing with random angle and distance
  // 1 degree latitude ≈ 111,000 meters
  const latOffset = (Math.random() - 0.5) * 2 * (radiusMeters / 111000);
  const lngOffset = (Math.random() - 0.5) * 2 * (radiusMeters / (111000 * Math.cos(lat * (Math.PI / 180))));

  return {
    fuzzedLat: lat + latOffset,
    fuzzedLng: lng + lngOffset,
  };
}
