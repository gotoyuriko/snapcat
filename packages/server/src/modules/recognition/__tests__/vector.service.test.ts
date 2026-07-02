import { VectorService } from '../vector.service';

// Mock PrismaClient
function createMockPrisma() {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };
}

describe('VectorService', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let service: VectorService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    service = new VectorService(mockPrisma as any);
  });

  describe('store', () => {
    it('should insert a new gallery embedding (not overwrite) using raw SQL', async () => {
      const catId = 'cat-uuid-123';
      const embedding = [0.1, 0.2, 0.3];

      await service.store(catId, embedding);

      // Two statements: insert the new embedding, then prune old ones beyond the cap.
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
      const [insertSql, insertCatId, insertVector] = mockPrisma.$executeRawUnsafe.mock.calls[0];
      expect(insertSql).toContain('INSERT INTO "CatEmbedding"');
      expect(insertCatId).toBe(catId);
      expect(insertVector).toBe('[0.1,0.2,0.3]');

      const [pruneSql, pruneCatId] = mockPrisma.$executeRawUnsafe.mock.calls[1];
      expect(pruneSql).toContain('DELETE FROM "CatEmbedding"');
      expect(pruneCatId).toBe(catId);
    });

    it('should format embedding array as pgvector string', async () => {
      const embedding = [1.0, -0.5, 0.0, 0.75];

      await service.store('some-id', embedding);

      const vectorArg = mockPrisma.$executeRawUnsafe.mock.calls[0][2];
      expect(vectorArg).toBe('[1,-0.5,0,0.75]');
    });
  });

  describe('findNearestCat', () => {
    it('should return top-3 matches with cosine similarity scores', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { id: 'cat-1', distance: 0.1 },
        { id: 'cat-2', distance: 0.3 },
        { id: 'cat-3', distance: 0.5 },
      ]);

      const embedding = [0.1, 0.2, 0.3];
      const results = await service.findNearestCat(embedding);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ catId: 'cat-1', similarity: 0.9 });
      expect(results[1]).toEqual({ catId: 'cat-2', similarity: 0.7 });
      expect(results[2]).toEqual({ catId: 'cat-3', similarity: 0.5 });
    });

    it('should pass the correct SQL with LIMIT 3 and ORDER BY distance ASC', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      const embedding = [0.5, 0.5];

      await service.findNearestCat(embedding);

      const sql = mockPrisma.$queryRawUnsafe.mock.calls[0][0];
      expect(sql).toContain('ORDER BY distance ASC');
      expect(sql).toContain('LIMIT 3');
      expect(sql).toContain('<=>');
      expect(sql).toContain('WHERE embedding IS NOT NULL');
    });

    it('should format the embedding as a pgvector string parameter', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      const embedding = [0.1, 0.2, 0.3];

      await service.findNearestCat(embedding);

      const vectorArg = mockPrisma.$queryRawUnsafe.mock.calls[0][1];
      expect(vectorArg).toBe('[0.1,0.2,0.3]');
    });

    it('should return empty array when no cats have embeddings', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const results = await service.findNearestCat([0.1, 0.2]);
      expect(results).toEqual([]);
    });

    it('should compute similarity as 1 - distance', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { id: 'cat-a', distance: 0.0 }, // identical = similarity 1.0
      ]);

      const results = await service.findNearestCat([1.0, 0.0]);
      expect(results[0].similarity).toBe(1.0);
    });
  });

  describe('searchNearest', () => {
    it('should return results filtered by threshold', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { id: 'cat-1', distance: 0.2 },
        { id: 'cat-2', distance: 0.4 },
      ]);

      const results = await service.searchNearest([0.1, 0.2], 5, 0.5);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ catId: 'cat-1', distance: 0.2 });
      expect(results[1]).toEqual({ catId: 'cat-2', distance: 0.4 });
    });

    it('should pass limit and threshold to the raw query', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchNearest([0.5], 10, 0.8);

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.any(String),
        '[0.5]',
        0.8,
        10,
      );
    });
  });
});
