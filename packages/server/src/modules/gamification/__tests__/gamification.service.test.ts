import { GamificationService, calculateLevel } from '../gamification.service';
import { AlertsService } from '../../alerts/alerts.service';

// --- Mock Prisma Client ---
function createMockPrisma() {
  return {
    user: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    ownership: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    userCatDiscovery: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    cat: {
      findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Whiskers' }),
    },
    donationXpLog: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { xpAwarded: 0 } }),
      create: jest.fn().mockResolvedValue({}),
    },
    scanXpLog: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

// --- Mock Alerts Service ---
function createMockAlerts(): jest.Mocked<AlertsService> {
  return {
    notify: jest.fn().mockResolvedValue(undefined),
    notifyCatFollowers: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('calculateLevel', () => {
  it('returns 0 for xp=0', () => {
    expect(calculateLevel(0)).toBe(0);
  });

  it('returns 1 for xp=1', () => {
    expect(calculateLevel(1)).toBe(1);
  });

  it('returns 1 for xp=5 (just below Lvl2 threshold)', () => {
    expect(calculateLevel(5)).toBe(1);
  });

  it('returns 2 for xp=6', () => {
    expect(calculateLevel(6)).toBe(2);
  });

  it('returns 10 for xp=226 (Lvl10 threshold)', () => {
    expect(calculateLevel(226)).toBe(10);
  });

  it('returns 10 for xp=1000 (above max threshold)', () => {
    expect(calculateLevel(1000)).toBe(10);
  });

  it('returns 5 for xp=51', () => {
    expect(calculateLevel(51)).toBe(5);
  });

  it('returns 4 for xp=50 (just below Lvl5)', () => {
    expect(calculateLevel(50)).toBe(4);
  });

  it('returns 7 for xp=106 (Lvl7 unlocks medical requests)', () => {
    expect(calculateLevel(106)).toBe(7);
  });
});

describe('GamificationService', () => {
  let service: GamificationService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let alerts: jest.Mocked<AlertsService>;

  beforeEach(() => {
    prisma = createMockPrisma();
    alerts = createMockAlerts();
    service = new GamificationService(prisma, alerts);
  });

  describe('recordAction - discover_new', () => {
    it('awards 16 XP globally for discovering a new cat', async () => {
      prisma.userCatDiscovery.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1' });
      prisma.ownership.findUnique.mockResolvedValue(null);
      prisma.ownership.create.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 16, level: 3 });

      const result = await service.recordAction('u1', 'c1', 'discover_new');

      expect(result.xpAwarded).toBe(16);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { xp: { increment: 16 } },
      });
    });

    it('starts the first discoverer at ownership Level 3 (16 XP = Lvl3 threshold)', async () => {
      prisma.userCatDiscovery.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1' });
      prisma.ownership.findUnique.mockResolvedValue(null);
      prisma.ownership.create.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 16, level: 3 });

      const result = await service.recordAction('u1', 'c1', 'discover_new');

      expect(result.xpAwarded).toBe(16);
      expect(result.newLevel).toBe(3);
      expect(result.levelUp).toBe(true);
      expect(prisma.ownership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          catId: 'c1',
          xp: 16,
          level: 3,
        }),
      });
    });

    it('does not create Ownership when UserCatDiscovery is missing', async () => {
      prisma.userCatDiscovery.findUnique.mockResolvedValue(null);
      prisma.ownership.findUnique.mockResolvedValue(null);

      const result = await service.recordAction('u1', 'c1', 'discover_new');

      expect(result.xpAwarded).toBe(16);
      expect(result.newLevel).toBe(0);
      expect(prisma.ownership.create).not.toHaveBeenCalled();
    });
  });

  describe('recordAction - scan', () => {
    it('awards 3 XP for scanning an existing cat (Req 6.2)', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 50, level: 4 });

      const result = await service.recordAction('u1', 'c1', 'scan');

      expect(result.xpAwarded).toBe(3);
    });

    it('does not touch the global XP total for a scan (Req 6.2 — per-cat only)', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 50, level: 4 });

      await service.recordAction('u1', 'c1', 'scan');

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('records a scan XP entry for once-per-day tracking', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 50, level: 4 });

      await service.recordAction('u1', 'c1', 'scan');

      expect(prisma.scanXpLog.create).toHaveBeenCalledWith({
        data: { userId: 'u1', catId: 'c1', xpAwarded: 3 },
      });
    });

    it('awards 0 XP when the cat was already scanned today (once per daily scan)', async () => {
      prisma.scanXpLog.count.mockResolvedValue(1);
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 53, level: 5 });

      const result = await service.recordAction('u1', 'c1', 'scan');

      expect(result.xpAwarded).toBe(0);
      expect(result.newLevel).toBe(5);
      expect(result.levelUp).toBe(false);
      expect(prisma.ownership.update).not.toHaveBeenCalled();
      expect(prisma.scanXpLog.create).not.toHaveBeenCalled();
    });
  });

  describe('recordAction - donation', () => {
    it('awards XP equal to MYR amount (amountCents / 100)', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 10, level: 2 });

      const result = await service.recordAction('u1', 'c1', 'donation', 500); // 5 RM = 5 XP

      expect(result.xpAwarded).toBe(5);
      // Donations award per-cat XP only (Req 6.3) — global total untouched
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns 0 XP when amountCents is missing', async () => {
      const result = await service.recordAction('u1', 'c1', 'donation');

      expect(result.xpAwarded).toBe(0);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('enforces daily donation XP cap of 200', async () => {
      // Already used 190 XP today
      prisma.donationXpLog.aggregate.mockResolvedValue({ _sum: { xpAwarded: 190 } });
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 190, level: 7 });

      // Try to donate 20 RM (20 XP) — only 10 should be awarded
      const result = await service.recordAction('u1', 'c1', 'donation', 2000);

      expect(result.xpAwarded).toBe(10);
    });

    it('returns 0 XP when daily cap is fully reached', async () => {
      prisma.donationXpLog.aggregate.mockResolvedValue({ _sum: { xpAwarded: 200 } });
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 200, level: 8 });

      const result = await service.recordAction('u1', 'c1', 'donation', 1000);

      expect(result.xpAwarded).toBe(0);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('records donation XP entry for daily cap tracking', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 10, level: 2 });

      await service.recordAction('u1', 'c1', 'donation', 1000);

      expect(prisma.donationXpLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'u1',
          catId: 'c1',
          xpAwarded: 10,
        },
      });
    });
  });

  describe('recordAction - medical_reimbursed', () => {
    it('awards 100 XP for medical reimbursement', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 100, level: 6 });

      const result = await service.recordAction('u1', 'c1', 'medical_reimbursed');

      expect(result.xpAwarded).toBe(100);
    });
  });

  describe('ownership level promotion', () => {
    it('promotes level when XP crosses threshold', async () => {
      // Currently at 5 XP (Lvl1), adding 3 scan XP crosses the Lvl2 threshold (6)
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 5, level: 1 });

      const result = await service.recordAction('u1', 'c1', 'scan');

      // 5 + 3 = 8 XP → Lvl2
      expect(result.newLevel).toBe(2);
      expect(result.levelUp).toBe(true);
      expect(prisma.ownership.update).toHaveBeenCalledWith({
        where: { userId_catId: { userId: 'u1', catId: 'c1' } },
        data: { xp: 8, level: 2 },
      });
    });

    it('sends push notification on level-up', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 5, level: 1 });

      await service.recordAction('u1', 'c1', 'scan');

      expect(alerts.notify).toHaveBeenCalledWith(
        'u1',
        'Level Up!',
        expect.stringContaining('Level 2'),
        expect.objectContaining({ catId: 'c1' }),
      );
    });

    it('does not send notification when no level-up occurs', async () => {
      // 2 XP (Lvl1), adding 1 XP for donation → still Lvl1
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 2, level: 1 });

      await service.recordAction('u1', 'c1', 'donation', 100);

      expect(alerts.notify).not.toHaveBeenCalled();
    });

    it('creates Ownership at correct level when first created with XP > 0', async () => {
      prisma.ownership.findUnique.mockResolvedValue(null);
      prisma.userCatDiscovery.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1' });
      prisma.ownership.create.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 3, level: 1 });

      const result = await service.recordAction('u1', 'c1', 'scan');

      expect(prisma.ownership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          xp: 3,
          level: 1, // calculateLevel(3) = 1 — first scan makes the user an Owner
        }),
      });
      expect(result.levelUp).toBe(true); // new record at Lvl1 > 0
    });
  });

  describe('getUserStats', () => {
    it('returns aggregate stats and rank for the user', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        displayName: 'Alice',
        email: 'alice@example.com',
        xp: 150,
      });
      prisma.userCatDiscovery.count.mockResolvedValue(5);
      prisma.ownership.count.mockResolvedValue(2);
      prisma.user.count.mockResolvedValue(3); // 3 users with more XP

      const stats = await service.getUserStats('u1');

      expect(stats).toEqual({
        userId: 'u1',
        displayName: 'Alice',
        email: 'alice@example.com',
        xp: 150,
        catsDiscovered: 5,
        catsOwned: 2,
        rank: 4, // 3 users ahead + self
      });
      expect(prisma.ownership.count).toHaveBeenCalledWith({
        where: { userId: 'u1', level: { gte: 1 } },
      });
    });

    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserStats('missing')).rejects.toThrow('User not found');
    });
  });

  describe('getLeaderboard', () => {
    it('returns users ranked by XP descending', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', displayName: 'Alice', xp: 500 },
        { id: 'u2', displayName: 'Bob', xp: 300 },
      ]);

      const leaderboard = await service.getLeaderboard(20);

      expect(leaderboard).toEqual([
        { userId: 'u1', displayName: 'Alice', xp: 500, rank: 1 },
        { userId: 'u2', displayName: 'Bob', xp: 300, rank: 2 },
      ]);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        orderBy: { xp: 'desc' },
        take: 20,
        select: { id: true, displayName: true, xp: true },
      });
    });
  });
});
