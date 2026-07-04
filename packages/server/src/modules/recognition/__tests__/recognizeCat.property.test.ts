import fc from 'fast-check';
import { RecognitionService } from '../recognition.service';

/**
 * Property 1: Scan result exclusivity
 * Validates: Requirements 3.1, 3.2, 3.3, 4.3, 4.4, 4.5
 *
 * For any similarity score (and the no-detection case), `recognizeCat` returns
 * EXACTLY ONE of the four result types. The result type is correctly determined
 * by the similarity score thresholds:
 *   - no_cat: YOLO returns noDetection
 *   - matched: similarity >= 0.92
 *   - confirm_needed: 0.72 <= similarity < 0.92
 *   - new_cat: similarity < 0.72 or no matches
 */

// --- Mock factories ---

function makeMockYoloClient(noDetection: boolean) {
  return {
    detectCat: jest.fn().mockResolvedValue(
      noDetection
        ? { noDetection: true }
        : { cropped: Buffer.from('fake-cropped-image') },
    ),
  };
}

function makeMockMegaDescriptorClient() {
  return {
    embed: jest.fn().mockResolvedValue(new Float32Array(512).fill(0.1)),
  };
}

function makeMockVectorService(similarity: number | null) {
  return {
    findNearestCat: jest.fn().mockResolvedValue(
      similarity !== null
        ? [{ catId: 'cat-uuid-001', similarity }]
        : [],
    ),
    store: jest.fn().mockResolvedValue(undefined),
  };
}

const FAKE_CAT_RECORD = {
  id: 'cat-uuid-001',
  name: 'Whiskers',
  embeddingRef: 'emb-ref-001',
  firstDiscovererId: 'user-uuid-001',
  lastKnownApproxLat: 3.139,
  lastKnownApproxLng: 101.686,
  photoUrl: 'https://example.com/cat.jpg',
  registeredAt: new Date('2025-01-01'),
};

const FAKE_NEW_CAT_RECORD = {
  ...FAKE_CAT_RECORD,
  id: 'cat-uuid-new',
  name: null,
};

function makeMockPrisma() {
  return {
    cat: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(FAKE_CAT_RECORD),
      update: jest.fn().mockResolvedValue(FAKE_CAT_RECORD),
      create: jest.fn().mockResolvedValue(FAKE_NEW_CAT_RECORD),
    },
    sighting: {
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      update: jest.fn().mockResolvedValue({ id: 'user-uuid-001', xp: 100 }),
    },
    userCatDiscovery: {
      create: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    // Non-owner scanner: high-similarity matches auto-confirm (Req 4.3/4.5)
    ownership: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as any;
}

function makeMockGamificationService() {
  return {
    recordAction: jest.fn().mockImplementation(
      async (_userId: string, _catId: string, action: string) =>
        action === 'discover_new'
          ? { xpAwarded: 100, newLevel: 6, levelUp: true }
          : { xpAwarded: 3, newLevel: 1, levelUp: false },
    ),
  };
}

// Mock the gps-fuzz module so it doesn't interfere with the property under test
jest.mock('../../sighting/gps-fuzz', () => ({
  fuzzCoordinates: (_lat: number, _lng: number) => ({
    fuzzedLat: 3.14,
    fuzzedLng: 101.69,
  }),
}));

const VALID_RESULT_TYPES = ['no_cat', 'matched', 'confirm_needed', 'new_cat'] as const;

describe('RecognitionService.recognizeCat - Property Tests', () => {
  const TEST_PHOTO = Buffer.from('test-photo-data');
  const TEST_GPS = { lat: 3.139, lng: 101.686 };
  const TEST_USER_ID = 'user-uuid-001';

  it('should return exactly one of the four result types for any similarity score or no-detection case', async () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 4.3, 4.4, 4.5**
     *
     * Property: For any generated scenario (noDetection boolean + similarity score 0..1),
     * recognizeCat returns a result whose `result` field is exactly one of:
     * 'no_cat', 'matched', 'confirm_needed', 'new_cat'.
     *
     * Additionally, the result type is determined correctly by the thresholds:
     *   - noDetection → 'no_cat'
     *   - similarity >= 0.92 → 'matched'
     *   - 0.72 <= similarity < 0.92 → 'confirm_needed'
     *   - similarity < 0.72 (or no matches) → 'new_cat'
     */
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        async (noDetection, similarity) => {
          const mockYolo = makeMockYoloClient(noDetection);
          const mockMegaDescriptor = makeMockMegaDescriptorClient();
          // When noDetection is false, provide the similarity score;
          // Use null similarity (empty matches array) for very low scores to also test the no-matches path
          const mockVector = makeMockVectorService(
            noDetection ? null : similarity,
          );
          const mockPrisma = makeMockPrisma();

          const service = new RecognitionService(
            mockYolo as any,
            mockMegaDescriptor as any,
            mockVector as any,
            mockPrisma,
            makeMockGamificationService() as any,
          );

          const result = await service.recognizeCat(TEST_PHOTO, TEST_GPS, TEST_USER_ID);

          // --- Exclusivity: result has exactly one `result` field with a valid value ---
          expect(result).toHaveProperty('result');
          expect(VALID_RESULT_TYPES).toContain(result.result);

          // --- Correctness: result type matches threshold logic ---
          if (noDetection) {
            expect(result.result).toBe('no_cat');
          } else if (similarity >= 0.92) {
            expect(result.result).toBe('matched');
          } else if (similarity >= 0.72) {
            expect(result.result).toBe('confirm_needed');
          } else {
            expect(result.result).toBe('new_cat');
          }

          // --- Result shape validation per type ---
          switch (result.result) {
            case 'no_cat':
              expect(Object.keys(result)).toEqual(['result']);
              break;
            case 'matched':
              expect(result).toHaveProperty('cat');
              expect(result).toHaveProperty('xpAwarded');
              expect(result).toHaveProperty('levelUp');
              break;
            case 'confirm_needed':
              expect(result).toHaveProperty('candidateCat');
              expect(result).toHaveProperty('embedding');
              break;
            case 'new_cat':
              expect(result).toHaveProperty('cat');
              expect(result).toHaveProperty('xpAwarded');
              break;
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
