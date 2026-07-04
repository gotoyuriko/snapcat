import { RecognitionService, RawGPS } from '../recognition.service';
import { YoloClient } from '../yolo.client';
import { MegaDescriptorClient } from '../megadescriptor.client';
import { VectorService } from '../vector.service';
import { PrismaClient } from '@prisma/client';
import { config } from '../../../config';

// Test against the actual configured thresholds (see config/index.ts) rather
// than hardcoded literals, so this suite stays correct as thresholds are tuned.
const { matchThreshold: MATCH_THRESHOLD, confirmThreshold: CONFIRM_THRESHOLD } = config.recognition;

// --- Mocks ---

const mockYoloClient = {
  detectCat: jest.fn(),
} as unknown as jest.Mocked<YoloClient>;

const mockMegaDescriptorClient = {
  embed: jest.fn(),
} as unknown as jest.Mocked<MegaDescriptorClient>;

const mockVectorService = {
  findNearestCat: jest.fn(),
  store: jest.fn(),
} as unknown as jest.Mocked<VectorService>;

const mockPrisma = {
  cat: {
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  sighting: {
    create: jest.fn(),
  },
  userCatDiscovery: {
    create: jest.fn(),
    upsert: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  // Non-owner by default; individual tests override for owner-confirm cases.
  ownership: {
    findUnique: jest.fn(),
  },
} as unknown as jest.Mocked<PrismaClient>;

// Mock GamificationService — recognition delegates all XP awarding to it
const mockGamificationService = {
  recordAction: jest.fn(),
};

// Mock gps-fuzz to return deterministic values
jest.mock('../../sighting/gps-fuzz', () => ({
  fuzzCoordinates: jest.fn(() => ({ fuzzedLat: 3.14, fuzzedLng: 101.7 })),
}));

describe('RecognitionService', () => {
  let service: RecognitionService;

  const testPhoto = Buffer.from('fake-photo');
  const testGPS: RawGPS = { lat: 3.139, lng: 101.687 };
  const testUserId = 'user-123';
  const testEmbedding = new Float32Array(512).fill(0.5);
  const testCroppedBuffer = Buffer.from('cropped-cat');

  const fakeCatRecord = {
    id: 'cat-abc',
    name: 'Whiskers',
    embeddingRef: 'ref-001',
    firstDiscovererId: 'user-456',
    lastKnownApproxLat: 3.14,
    lastKnownApproxLng: 101.7,
    photoUrl: 'https://photos.example.com/cat.jpg',
    registeredAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new RecognitionService(
      mockYoloClient,
      mockMegaDescriptorClient,
      mockVectorService,
      mockPrisma,
      mockGamificationService as any,
    );

    // Default: embed returns a 512-dim vector
    (mockMegaDescriptorClient.embed as jest.Mock).mockResolvedValue(testEmbedding);

    // Default: user update returns a user record
    (mockPrisma.user as any).update.mockResolvedValue({ id: testUserId, xp: 110 });

    // Default: XP awards — 100 XP for discovery, 3 XP for a re-sight scan
    mockGamificationService.recordAction.mockImplementation(
      async (_userId: string, _catId: string, action: string) =>
        action === 'discover_new'
          ? { xpAwarded: 100, newLevel: 6, levelUp: true }
          : { xpAwarded: 3, newLevel: 1, levelUp: false },
    );

    // Default: cat findUniqueOrThrow returns a cat
    (mockPrisma.cat as any).findUniqueOrThrow.mockResolvedValue(fakeCatRecord);

    // Default: cat create returns a new cat record
    (mockPrisma.cat as any).create.mockResolvedValue({
      ...fakeCatRecord,
      id: 'new-cat-id',
      firstDiscovererId: testUserId,
      name: null,
      photoUrl: null,
    });

    // Default: cat update resolves
    (mockPrisma.cat as any).update.mockResolvedValue(fakeCatRecord);

    // Default: sighting and discovery creation resolve
    (mockPrisma.sighting as any).create.mockResolvedValue({});
    (mockPrisma.userCatDiscovery as any).create.mockResolvedValue({});
    (mockPrisma.userCatDiscovery as any).upsert.mockResolvedValue({});

    // Default: vector store resolves
    (mockVectorService.store as jest.Mock).mockResolvedValue(undefined);

    // Default: scanner has no ownership record (non-owner path)
    (mockPrisma.ownership as any).findUnique.mockResolvedValue(null);
  });

  describe('recognizeCat', () => {
    describe('Stage 1: No cat detection', () => {
      it('should return { result: "no_cat" } when YOLO detects no cat', async () => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ noDetection: true });

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result).toEqual({ result: 'no_cat' });
      });

      it('should NOT call embed when no cat is detected', async () => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ noDetection: true });

        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(mockMegaDescriptorClient.embed).not.toHaveBeenCalled();
      });

      it('should NOT call findNearestCat when no cat is detected', async () => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ noDetection: true });

        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(mockVectorService.findNearestCat).not.toHaveBeenCalled();
      });

      it('should NOT create any sighting when no cat is detected', async () => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ noDetection: true });

        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect((mockPrisma.sighting as any).create).not.toHaveBeenCalled();
      });
    });

    describe('Stage 2: Embedding and similarity search', () => {
      it('should call embed with the cropped buffer from YOLO', async () => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ cropped: testCroppedBuffer });
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([]);

        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(mockMegaDescriptorClient.embed).toHaveBeenCalledWith(testCroppedBuffer);
      });

      it('should call findNearestCat with the embedding array', async () => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ cropped: testCroppedBuffer });
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([]);

        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(mockVectorService.findNearestCat).toHaveBeenCalledWith(Array.from(testEmbedding));
      });
    });

    describe(`Threshold: High similarity (≥ ${MATCH_THRESHOLD}) → matched`, () => {
      beforeEach(() => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ cropped: testCroppedBuffer });
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([
          { catId: 'cat-abc', similarity: Math.min(1, MATCH_THRESHOLD + 0.05) },
        ]);
      });

      it('should return result "matched" with the cat data', async () => {
        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('matched');
        if (result.result === 'matched') {
          expect(result.cat.id).toBe('cat-abc');
          expect(result.xpAwarded).toBeGreaterThan(0);
          expect(typeof result.levelUp).toBe('boolean');
        }
      });

      it('should route Lvl1+ owners to confirm_needed even above the match threshold (Req 4.4)', async () => {
        (mockPrisma.ownership as any).findUnique.mockResolvedValue({
          userId: testUserId,
          catId: 'cat-abc',
          level: 2,
          xp: 10,
        });

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('confirm_needed');
        expect((mockPrisma.sighting as any).create).not.toHaveBeenCalled();
        expect(mockGamificationService.recordAction).not.toHaveBeenCalled();
      });

      it('should auto-confirm for a Lvl0 discoverer (Req 4.5)', async () => {
        (mockPrisma.ownership as any).findUnique.mockResolvedValue({
          userId: testUserId,
          catId: 'cat-abc',
          level: 0,
          xp: 0,
        });

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('matched');
      });

      it('should create a sighting record', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect((mockPrisma.sighting as any).create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              catId: 'cat-abc',
              reporterId: testUserId,
              type: 'scan',
            }),
          }),
        );
      });

      it('should award scan XP through the gamification service', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(mockGamificationService.recordAction).toHaveBeenCalledWith(
          testUserId,
          'cat-abc',
          'scan',
        );
      });

      it('should upsert a UserCatDiscovery record for the scanner', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect((mockPrisma.userCatDiscovery as any).upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { userId_catId: { userId: testUserId, catId: 'cat-abc' } },
          }),
        );
      });

      it('should store updated embedding for the matched cat', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(mockVectorService.store).toHaveBeenCalledWith('cat-abc', Array.from(testEmbedding));
      });
    });

    describe(`Threshold: Borderline similarity (${CONFIRM_THRESHOLD}–${MATCH_THRESHOLD}) → confirm_needed`, () => {
      beforeEach(() => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ cropped: testCroppedBuffer });
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([
          { catId: 'cat-abc', similarity: (CONFIRM_THRESHOLD + MATCH_THRESHOLD) / 2 },
        ]);
      });

      it('should return result "confirm_needed" with candidate cat and embedding', async () => {
        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('confirm_needed');
        if (result.result === 'confirm_needed') {
          expect(result.candidateCat.id).toBe('cat-abc');
          expect(result.embedding).toEqual(Array.from(testEmbedding));
        }
      });

      it('should NOT create a sighting (user must confirm first)', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect((mockPrisma.sighting as any).create).not.toHaveBeenCalled();
      });

      it('should NOT award XP (user must confirm first)', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(mockGamificationService.recordAction).not.toHaveBeenCalled();
      });
    });

    describe(`Threshold: Low similarity (< ${CONFIRM_THRESHOLD}) → new_cat`, () => {
      beforeEach(() => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ cropped: testCroppedBuffer });
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([
          { catId: 'cat-abc', similarity: Math.max(0, CONFIRM_THRESHOLD - 0.2) },
        ]);
      });

      it('should return result "new_cat" with the new cat data and XP', async () => {
        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('new_cat');
        if (result.result === 'new_cat') {
          expect(result.cat.id).toBe('new-cat-id');
          expect(result.xpAwarded).toBe(100);
        }
        expect(mockGamificationService.recordAction).toHaveBeenCalledWith(
          testUserId,
          'new-cat-id',
          'discover_new',
        );
      });

      it('should create a new Cat record', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect((mockPrisma.cat as any).create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              firstDiscovererId: testUserId,
            }),
          }),
        );
      });

      it('should create a UserCatDiscovery record', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect((mockPrisma.userCatDiscovery as any).create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId: testUserId,
              catId: 'new-cat-id',
            }),
          }),
        );
      });

      it('should store the embedding for the new cat', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(mockVectorService.store).toHaveBeenCalledWith('new-cat-id', Array.from(testEmbedding));
      });

      it('should create a sighting for the new cat', async () => {
        await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect((mockPrisma.sighting as any).create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              catId: 'new-cat-id',
              reporterId: testUserId,
              type: 'scan',
            }),
          }),
        );
      });
    });

    describe('Threshold: No matches at all → new_cat', () => {
      it('should return "new_cat" when findNearestCat returns empty array', async () => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ cropped: testCroppedBuffer });
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([]);

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('new_cat');
      });
    });

    describe('Boundary values', () => {
      beforeEach(() => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ cropped: testCroppedBuffer });
      });

      it(`should return "matched" at exactly ${MATCH_THRESHOLD} similarity`, async () => {
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([
          { catId: 'cat-abc', similarity: MATCH_THRESHOLD },
        ]);

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('matched');
      });

      it(`should return "confirm_needed" just below ${MATCH_THRESHOLD}`, async () => {
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([
          { catId: 'cat-abc', similarity: MATCH_THRESHOLD - 0.0001 },
        ]);

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('confirm_needed');
      });

      it(`should return "confirm_needed" at exactly ${CONFIRM_THRESHOLD} similarity`, async () => {
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([
          { catId: 'cat-abc', similarity: CONFIRM_THRESHOLD },
        ]);

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('confirm_needed');
      });

      it(`should return "new_cat" just below ${CONFIRM_THRESHOLD}`, async () => {
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([
          { catId: 'cat-abc', similarity: CONFIRM_THRESHOLD - 0.0001 },
        ]);

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        expect(result.result).toBe('new_cat');
      });
    });

    describe('Level-up detection', () => {
      beforeEach(() => {
        (mockYoloClient.detectCat as jest.Mock).mockResolvedValue({ cropped: testCroppedBuffer });
        (mockVectorService.findNearestCat as jest.Mock).mockResolvedValue([
          { catId: 'cat-abc', similarity: 0.95 },
        ]);
      });

      it('should set levelUp = true when the gamification service reports a promotion', async () => {
        mockGamificationService.recordAction.mockResolvedValue({
          xpAwarded: 3,
          newLevel: 2,
          levelUp: true,
        });

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        if (result.result === 'matched') {
          expect(result.levelUp).toBe(true);
        }
      });

      it('should set levelUp = false when no promotion occurs', async () => {
        mockGamificationService.recordAction.mockResolvedValue({
          xpAwarded: 3,
          newLevel: 1,
          levelUp: false,
        });

        const result = await service.recognizeCat(testPhoto, testGPS, testUserId);

        if (result.result === 'matched') {
          expect(result.levelUp).toBe(false);
        }
      });
    });
  });

  describe('confirmMatch', () => {
    const testEmbeddingArray = Array.from(new Float32Array(512).fill(0.5));
    const testPhotoUrl = 'https://storage.example.com/photo.jpg';

    describe('when catId is a UUID (confirm existing match)', () => {
      it('should return "matched" result with cat data and XP', async () => {
        const result = await service.confirmMatch(
          testUserId,
          'cat-abc',
          testEmbeddingArray,
          testGPS,
          testPhotoUrl,
        );

        expect(result.result).toBe('matched');
        if (result.result === 'matched') {
          expect(result.cat.id).toBe('cat-abc');
          expect(result.xpAwarded).toBeGreaterThan(0);
        }
      });

      it('should create a sighting record', async () => {
        await service.confirmMatch(testUserId, 'cat-abc', testEmbeddingArray, testGPS, testPhotoUrl);

        expect((mockPrisma.sighting as any).create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              catId: 'cat-abc',
              reporterId: testUserId,
              photoUrl: testPhotoUrl,
            }),
          }),
        );
      });

      it('should store the embedding', async () => {
        await service.confirmMatch(testUserId, 'cat-abc', testEmbeddingArray, testGPS, testPhotoUrl);

        expect(mockVectorService.store).toHaveBeenCalledWith('cat-abc', testEmbeddingArray);
      });
    });

    describe('when catId is "new" (register new cat)', () => {
      it('should return "new_cat" result with new cat data', async () => {
        const result = await service.confirmMatch(
          testUserId,
          'new',
          testEmbeddingArray,
          testGPS,
          testPhotoUrl,
        );

        expect(result.result).toBe('new_cat');
        if (result.result === 'new_cat') {
          expect(result.cat.id).toBe('new-cat-id');
          expect(result.xpAwarded).toBeGreaterThan(0);
        }
      });

      it('should create a new Cat record with the photo URL', async () => {
        await service.confirmMatch(testUserId, 'new', testEmbeddingArray, testGPS, testPhotoUrl);

        expect((mockPrisma.cat as any).create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              firstDiscovererId: testUserId,
              photoUrl: testPhotoUrl,
            }),
          }),
        );
      });

      it('should create a UserCatDiscovery record', async () => {
        await service.confirmMatch(testUserId, 'new', testEmbeddingArray, testGPS, testPhotoUrl);

        expect((mockPrisma.userCatDiscovery as any).create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              userId: testUserId,
              catId: 'new-cat-id',
            }),
          }),
        );
      });
    });
  });
});
