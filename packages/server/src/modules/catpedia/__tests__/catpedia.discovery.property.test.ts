import * as fc from 'fast-check';
import { CatpediaService, CatpediaFilter } from '../catpedia.service';

/**
 * Property 9: Discovery state controls Catpedia visibility
 * **Validates: Requirements 7.3, 7.4, 7.5**
 *
 * For any Catpedia response for a given userId, every cat in the response that
 * is NOT in the user's UserCatDiscovery set contains no name or photoUrl field.
 * Every cat that IS in the discovery set contains both name and photoUrl fields.
 */

// Mock PrismaClient before importing the service
jest.mock('@prisma/client', () => {
  const mockFindMany = jest.fn();
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      cat: {
        findMany: mockFindMany,
      },
    })),
    __mockFindMany: mockFindMany,
  };
});

// Access the mocked prisma instance
const { __mockFindMany: mockCatFindMany } = jest.requireMock('@prisma/client');

describe('CatpediaService.getCats — Discovery State Property Tests', () => {
  let service: CatpediaService;

  beforeEach(() => {
    service = new CatpediaService();
    jest.clearAllMocks();
  });

  /**
   * **Validates: Requirements 7.3, 7.4, 7.5**
   *
   * Property: For any userId, any list of cats, and any filter mode, every cat
   * NOT in the user's UserCatDiscovery set is returned without name or photoUrl
   * keys (discovered: false). Every cat IN the discovery set is returned with
   * both name and photoUrl keys (discovered: true).
   */
  it('undiscovered cats have no name or photoUrl; discovered cats have both', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random userId
        fc.uuid(),
        // Generate a list of cats (1–15 cats)
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
          { minLength: 1, maxLength: 15 },
        ),
        // Generate a random boolean function to determine which cats are "discovered"
        fc.func(fc.boolean()),
        // Generate filter mode
        fc.constantFrom<CatpediaFilter>('all', 'discovered', 'owned'),
        async (userId, cats, isDiscoveredFn, filter) => {
          // Determine which cats are discovered by this user
          const discoveredCatIds = new Set<string>();
          cats.forEach((cat, index) => {
            if (isDiscoveredFn(index)) {
              discoveredCatIds.add(cat.id);
            }
          });

          // Mock prisma.cat.findMany to return cats with discovery info
          mockCatFindMany.mockResolvedValue(
            cats.map((cat) => ({
              id: cat.id,
              name: cat.name,
              photoUrl: cat.photoUrl,
              lastKnownApproxLat: cat.lastKnownApproxLat,
              lastKnownApproxLng: cat.lastKnownApproxLng,
              discoveries: discoveredCatIds.has(cat.id)
                ? [{ userId }]
                : [],
              ownerships: [],
            })),
          );

          // Call getCats with the given filter
          const result = await service.getCats(userId, filter);

          // Assert the property for every entry in the response
          for (const entry of result) {
            if (discoveredCatIds.has(entry.id)) {
              // Discovered: must have discovered: true and contain name and photoUrl
              expect(entry.discovered).toBe(true);
              expect(entry).toHaveProperty('name');
              expect(entry).toHaveProperty('photoUrl');
            } else {
              // Undiscovered: must have discovered: false and NOT contain name or photoUrl
              expect(entry.discovered).toBe(false);
              expect('name' in entry).toBe(false);
              expect('photoUrl' in entry).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
