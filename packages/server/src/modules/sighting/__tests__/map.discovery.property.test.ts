import * as fc from 'fast-check';
import { SightingService } from '../sighting.service';

/**
 * Property 9: Discovery state controls map and Catpedia visibility
 * **Validates: Requirements 2.2, 2.3, 2.4, 7.3, 7.4, 7.5**
 *
 * For any userId and cat list, every cat NOT in the user's UserCatDiscovery set
 * is returned as a silhouette without name, photo, or exact coordinates (only
 * catId, approxLat, approxLng, discovered: false). Every cat IN the discovery set
 * is returned with full data (name, photoUrl, discovered: true).
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

describe('SightingService.getMapPins — Discovery State Property Tests', () => {
  let service: SightingService;

  beforeEach(() => {
    service = new SightingService();
    jest.clearAllMocks();
  });

  /**
   * **Validates: Requirements 2.2, 2.3, 2.4, 7.3, 7.4, 7.5**
   *
   * Property: For any userId and any list of cats, every cat NOT in the user's
   * UserCatDiscovery set is returned as a silhouette pin (discovered: false)
   * without name or photoUrl fields. Every cat IN the discovery set is returned
   * with discovered: true and contains name and photoUrl.
   */
  it('undiscovered cats are silhouettes without name/photoUrl; discovered cats have full data', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random userId
        fc.uuid(),
        // Generate a list of cats (1–20 cats)
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.oneof(fc.string({ minLength: 1, maxLength: 30 }), fc.constant(null)),
            photoUrl: fc.oneof(
              fc.webUrl().map((url) => url.slice(0, 100)),
              fc.constant(null),
            ),
            lastKnownApproxLat: fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
            lastKnownApproxLng: fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        // Generate a random subset of indices representing discovered cats
        fc.func(fc.boolean()),
        async (userId, cats, isDiscoveredFn) => {
          // Determine which cats are discovered by this user
          const discoveredCatIds = new Set<string>();
          cats.forEach((cat, index) => {
            if (isDiscoveredFn(index)) {
              discoveredCatIds.add(cat.id);
            }
          });

          // Mock prisma.cat.findMany to return cats with their discoveries
          mockPrisma.cat.findMany.mockResolvedValue(
            cats.map((cat) => ({
              id: cat.id,
              name: cat.name,
              photoUrl: cat.photoUrl,
              lastKnownApproxLat: cat.lastKnownApproxLat,
              lastKnownApproxLng: cat.lastKnownApproxLng,
              discoveries: discoveredCatIds.has(cat.id)
                ? [{ userId }]
                : [],
            })),
          );

          // Call getMapPins
          const pins = await service.getMapPins(userId);

          // Assert: every pin corresponds to a cat
          expect(pins.length).toBe(cats.length);

          for (const pin of pins) {
            const originalCat = cats.find((c) => c.id === pin.catId);
            expect(originalCat).toBeDefined();

            if (discoveredCatIds.has(pin.catId)) {
              // Discovered: must have full data
              expect(pin.discovered).toBe(true);
              expect(pin).toHaveProperty('name');
              expect(pin).toHaveProperty('photoUrl');
              expect((pin as any).name).toBe(originalCat!.name);
              expect((pin as any).photoUrl).toBe(originalCat!.photoUrl);
              expect(pin.approxLat).toBe(originalCat!.lastKnownApproxLat);
              expect(pin.approxLng).toBe(originalCat!.lastKnownApproxLng);
            } else {
              // Undiscovered: silhouette only — no name or photoUrl
              expect(pin.discovered).toBe(false);
              expect(pin).not.toHaveProperty('name');
              expect(pin).not.toHaveProperty('photoUrl');
              expect(pin.approxLat).toBe(originalCat!.lastKnownApproxLat);
              expect(pin.approxLng).toBe(originalCat!.lastKnownApproxLng);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
