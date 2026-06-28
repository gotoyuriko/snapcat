import { CatpediaService, CatpediaEntry } from '../catpedia.service';

// Mock PrismaClient
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

// Get reference to mock
const { __mockFindMany: mockCatFindMany } = jest.requireMock('@prisma/client');

describe('CatpediaService', () => {
  let service: CatpediaService;
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CatpediaService();
  });

  // Helpers to create test cat data
  const makeCat = (
    id: string,
    opts: {
      name?: string | null;
      photoUrl?: string | null;
      discovered?: boolean;
      ownershipLevel?: number;
      ownershipXp?: number;
    } = {},
  ) => ({
    id,
    name: opts.name ?? `Cat ${id}`,
    photoUrl: opts.photoUrl ?? `https://photos.example.com/${id}.jpg`,
    lastKnownApproxLat: 3.1 + Math.random(),
    lastKnownApproxLng: 101.6 + Math.random(),
    discoveries: opts.discovered !== false ? [{ userId }] : [],
    ownerships:
      opts.ownershipLevel !== undefined
        ? [{ level: opts.ownershipLevel, xp: opts.ownershipXp ?? 0 }]
        : [],
  });

  describe('filter: all', () => {
    it('returns all cats with correct visibility (discovered vs undiscovered)', async () => {
      const discoveredCat = makeCat('cat-1', { discovered: true, name: 'Whiskers', photoUrl: 'http://img/whiskers.jpg' });
      const ownedCat = makeCat('cat-2', { discovered: true, ownershipLevel: 2, ownershipXp: 150, name: 'Mittens', photoUrl: 'http://img/mittens.jpg' });
      const undiscoveredCat = makeCat('cat-3', { discovered: false, name: 'Secret Cat', photoUrl: 'http://img/secret.jpg' });

      mockCatFindMany.mockResolvedValue([discoveredCat, ownedCat, undiscoveredCat]);

      const result = await service.getCats(userId, 'all');

      expect(result).toHaveLength(3);

      // Discovered cat — full info visible
      const entry1 = result.find((e) => e.id === 'cat-1')!;
      expect(entry1.discovered).toBe(true);
      expect((entry1 as any).name).toBe('Whiskers');
      expect((entry1 as any).photoUrl).toBe('http://img/whiskers.jpg');

      // Owned cat — full info visible
      const entry2 = result.find((e) => e.id === 'cat-2')!;
      expect(entry2.discovered).toBe(true);
      expect((entry2 as any).name).toBe('Mittens');
      expect((entry2 as any).level).toBe(2);
      expect((entry2 as any).xp).toBe(150);
      expect((entry2 as any).owned).toBe(true);

      // Undiscovered cat — silhouette only
      const entry3 = result.find((e) => e.id === 'cat-3')!;
      expect(entry3.discovered).toBe(false);
      expect((entry3 as any).name).toBeUndefined();
      expect((entry3 as any).photoUrl).toBeUndefined();
    });
  });

  describe('filter: discovered', () => {
    it('returns only cats the user has discovered but does not own', async () => {
      const discoveredOnly = makeCat('cat-1', { discovered: true, name: 'Stray Kitty' });
      const ownedCat = makeCat('cat-2', { discovered: true, ownershipLevel: 1, name: 'My Pet' });
      const undiscoveredCat = makeCat('cat-3', { discovered: false, name: 'Unknown' });

      mockCatFindMany.mockResolvedValue([discoveredOnly, ownedCat, undiscoveredCat]);

      const result = await service.getCats(userId, 'discovered');

      // Should only include cat-1 (discovered but not owned)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cat-1');
      expect(result[0].discovered).toBe(true);
      expect((result[0] as any).name).toBe('Stray Kitty');
      expect((result[0] as any).owned).toBe(false);
    });

    it('excludes cats with Lvl0 ownership (level 0 does not count as owned)', async () => {
      const discoveredWithLvl0 = makeCat('cat-1', { discovered: true, ownershipLevel: 0, name: 'Level Zero' });

      mockCatFindMany.mockResolvedValue([discoveredWithLvl0]);

      const result = await service.getCats(userId, 'discovered');

      // Level 0 ownership does NOT count as "owned" — cat should appear in discovered filter
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('cat-1');
      expect((result[0] as any).owned).toBe(false);
    });
  });

  describe('filter: owned', () => {
    it('returns only cats the user owns (Lvl1+)', async () => {
      const discoveredOnly = makeCat('cat-1', { discovered: true, name: 'Stray' });
      const ownedLvl1 = makeCat('cat-2', { discovered: true, ownershipLevel: 1, ownershipXp: 50, name: 'Pet One' });
      const ownedLvl3 = makeCat('cat-3', { discovered: true, ownershipLevel: 3, ownershipXp: 300, name: 'Pet Three' });
      const undiscovered = makeCat('cat-4', { discovered: false, name: 'Hidden' });

      mockCatFindMany.mockResolvedValue([discoveredOnly, ownedLvl1, ownedLvl3, undiscovered]);

      const result = await service.getCats(userId, 'owned');

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id).sort()).toEqual(['cat-2', 'cat-3']);

      const pet1 = result.find((e) => e.id === 'cat-2')!;
      expect((pet1 as any).level).toBe(1);
      expect((pet1 as any).xp).toBe(50);
      expect((pet1 as any).owned).toBe(true);

      const pet3 = result.find((e) => e.id === 'cat-3')!;
      expect((pet3 as any).level).toBe(3);
      expect((pet3 as any).xp).toBe(300);
      expect((pet3 as any).owned).toBe(true);
    });

    it('excludes cats with Lvl0 ownership', async () => {
      const lvl0Cat = makeCat('cat-1', { discovered: true, ownershipLevel: 0, name: 'Not Yet' });

      mockCatFindMany.mockResolvedValue([lvl0Cat]);

      const result = await service.getCats(userId, 'owned');

      expect(result).toHaveLength(0);
    });
  });

  describe('undiscovered cats privacy', () => {
    it('never exposes name or photo for undiscovered cats', async () => {
      const undiscovered = makeCat('cat-secret', {
        discovered: false,
        name: 'Super Secret Name',
        photoUrl: 'http://img/secret-photo.jpg',
      });

      mockCatFindMany.mockResolvedValue([undiscovered]);

      const result = await service.getCats(userId, 'all');

      expect(result).toHaveLength(1);
      const entry = result[0];
      expect(entry.discovered).toBe(false);
      // Name and photo must NOT be present on undiscovered entries
      expect('name' in entry).toBe(false);
      expect('photoUrl' in entry).toBe(false);
      // Should still have id and approximate location
      expect(entry.id).toBe('cat-secret');
      expect('approxLat' in entry).toBe(true);
      expect('approxLng' in entry).toBe(true);
    });

    it('undiscovered cats are excluded from discovered and owned filters', async () => {
      const undiscovered = makeCat('cat-hidden', { discovered: false, name: 'Hidden' });

      mockCatFindMany.mockResolvedValue([undiscovered]);

      const discoveredResult = await service.getCats(userId, 'discovered');
      const ownedResult = await service.getCats(userId, 'owned');

      expect(discoveredResult).toHaveLength(0);
      expect(ownedResult).toHaveLength(0);
    });
  });
});
