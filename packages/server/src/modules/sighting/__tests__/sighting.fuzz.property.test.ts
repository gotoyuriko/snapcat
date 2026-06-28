import * as fc from 'fast-check';
import { SightingService } from '../sighting.service';

/**
 * Property 2: GPS fuzz invariant (sighting layer)
 * **Validates: Requirements 5.3, 5.5, 14.2**
 *
 * For any sighting created by `appendSighting`, the stored coordinates
 * differ from the raw GPS input (never raw). The offset distance
 * is always between 100m and 200m.
 */

// Mock PrismaClient before importing the service
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    sighting: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    cat: {
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
    __mockPrisma: mockPrisma,
  };
});

// Access the mocked prisma instance
const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client');

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

describe('SightingService.appendSighting — GPS Fuzz Property Tests', () => {
  let service: SightingService;

  beforeEach(() => {
    service = new SightingService();

    // Mock prisma.sighting.create to return data passed to it
    mockPrisma.sighting.create.mockImplementation(({ data }: any) => {
      return Promise.resolve({
        id: 'test-sighting-id',
        catId: data.catId,
        reporterId: data.reporterId,
        fuzzedLat: data.fuzzedLat,
        fuzzedLng: data.fuzzedLng,
        photoUrl: data.photoUrl,
        type: data.type,
        timestamp: new Date(),
      });
    });

    // Mock prisma.cat.update to succeed
    mockPrisma.cat.update.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * **Validates: Requirements 5.3, 5.5, 14.2**
   *
   * Property: For any valid GPS coordinate (lat in [-89.9, 89.9], lng in [-180, 180]),
   * appendSighting stores fuzzed coordinates that differ from raw input,
   * with the offset distance between 100m and 200m.
   * The raw GPS is NEVER stored.
   */
  it('stored coordinates always differ from raw GPS input by 100–200m', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate lat in [-89.9, 89.9] to avoid pole singularity
        fc.double({ min: -89.9, max: 89.9, noNaN: true, noDefaultInfinity: true }),
        // Generate lng in [-180, 180]
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        async (lat, lng) => {
          const result = await service.appendSighting(
            'cat-123',
            'reporter-456',
            { lat, lng },
            'https://example.com/photo.jpg',
            'scan',
          );

          // The stored coordinates must differ from raw input
          const differs = result.fuzzedLat !== lat || result.fuzzedLng !== lng;
          expect(differs).toBe(true);

          // Distance between raw and stored must be 100-200m
          const distance = approximateDistanceMeters(
            lat,
            lng,
            result.fuzzedLat,
            result.fuzzedLng,
          );

          // Allow small floating-point tolerance
          expect(distance).toBeGreaterThanOrEqual(99.99);
          expect(distance).toBeLessThanOrEqual(200.01);
        },
      ),
      { numRuns: 200 },
    );
  });
});
