import * as fc from 'fast-check';
import { fuzzCoordinates } from '../gps-fuzz';

/**
 * Property 2: GPS fuzz invariant
 * Validates: Requirements 5.3, 5.5, 14.2
 *
 * For any valid (lat, lng) input, fuzzCoordinates always returns
 * coordinates that differ from the input by a non-zero offset
 * between 100m and 200m.
 */

/**
 * Compute approximate distance in meters between two GPS points
 * using the equirectangular approximation (accurate enough for 100-200m offsets).
 */
function approximateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const metersPerDegreeLat = 111000;
  const avgLat = (lat1 + lat2) / 2;
  const metersPerDegreeLng = 111000 * Math.cos(avgLat * (Math.PI / 180));

  const dLat = (lat2 - lat1) * metersPerDegreeLat;
  const dLng = (lng2 - lng1) * metersPerDegreeLng;

  return Math.sqrt(dLat * dLat + dLng * dLng);
}

describe('GPS Fuzz — Property Tests', () => {
  /**
   * **Validates: Requirements 5.3, 5.5, 14.2**
   *
   * Property: For any valid GPS coordinate (lat in [-89.9, 89.9], lng in [-180, 180]),
   * fuzzCoordinates returns non-null values that differ from the input,
   * with the offset distance between 100m and 200m.
   *
   * We exclude lat values very close to ±90 because cos(90°) = 0,
   * which makes the longitude offset calculation degenerate (division by zero).
   */
  it('fuzzed output always differs from input by 100–200m offset', () => {
    fc.assert(
      fc.property(
        // Generate lat in [-89.9, 89.9] to avoid pole singularity
        fc.double({ min: -89.9, max: 89.9, noNaN: true, noDefaultInfinity: true }),
        // Generate lng in [-180, 180]
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        (lat, lng) => {
          const result = fuzzCoordinates(lat, lng);

          // Non-null outputs
          expect(result.fuzzedLat).not.toBeNull();
          expect(result.fuzzedLng).not.toBeNull();

          const fuzzedLat = result.fuzzedLat as number;
          const fuzzedLng = result.fuzzedLng as number;

          // Output differs from input
          const differs = fuzzedLat !== lat || fuzzedLng !== lng;
          expect(differs).toBe(true);

          // Distance is between 100m and 200m
          const distance = approximateDistanceMeters(lat, lng, fuzzedLat, fuzzedLng);

          // Allow small floating-point tolerance
          expect(distance).toBeGreaterThanOrEqual(99.99);
          expect(distance).toBeLessThanOrEqual(200.01);
        },
      ),
      { numRuns: 200 },
    );
  });
});
