/**
 * GPS Fuzzing Utility
 * Adds a random ±100–200 m offset to GPS coordinates to protect cat colony locations.
 * The offset magnitude is always between 100 m and 200 m (never less than 100 m).
 */

export interface FuzzedCoordinates {
  fuzzedLat: number | null;
  fuzzedLng: number | null;
}

/**
 * Fuzz GPS coordinates by adding a random offset of ±100–200 meters.
 * The offset distance is uniformly distributed between 100 m and 200 m,
 * applied at a random angle (0–2π).
 *
 * @param lat - Original latitude
 * @param lng - Original longitude
 * @returns Fuzzed coordinates, or { fuzzedLat: null, fuzzedLng: null } on error
 */
export function fuzzCoordinates(lat: number, lng: number): FuzzedCoordinates {
  try {
    // Random distance between 100 and 200 meters
    const distance = 100 + Math.random() * 100;

    // Random angle in radians (0 to 2π)
    const angle = Math.random() * 2 * Math.PI;

    // 1 degree latitude ≈ 111,000 meters
    const metersPerDegreeLat = 111000;

    // Longitude offset adjusted by cos(lat) for accurate distance at different latitudes
    const metersPerDegreeLng = 111000 * Math.cos(lat * (Math.PI / 180));

    // Convert distance + angle to lat/lng offsets
    const latOffset = (distance * Math.cos(angle)) / metersPerDegreeLat;
    const lngOffset = (distance * Math.sin(angle)) / metersPerDegreeLng;

    return {
      fuzzedLat: lat + latOffset,
      fuzzedLng: lng + lngOffset,
    };
  } catch {
    return {
      fuzzedLat: null,
      fuzzedLng: null,
    };
  }
}
