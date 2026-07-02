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

  it('returns 10 for xp=486', () => {
    expect(calculateLevel(486)).toBe(10);
  });

  it('returns 10 for xp=1000 (above max threshold)', () => {
    expect(calculateLevel(1000)).toBe(10);
  });

  it('returns 5 for xp=56', () => {
    expect(calculateLevel(56)).toBe(5);
  });

  it('returns 4 for xp=55 (just below Lvl5)', () => {
    expect(calculateLevel(55)).toBe(4);
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
    it('awards 100 XP for discovering a new cat', async () => {
      prisma.userCatDiscovery.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1' });
      prisma.ownership.findUnique.mockResolvedValue(null);
      prisma.ownership.create.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 100, level: 10 });

      const result = await service.recordAction('u1', 'c1', 'discover_new');

      expect(result.xpAwarded).toBe(100);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { xp: { increment: 100 } },
      });
    });

    it('creates Ownership record when UserCatDiscovery exists', async () => {
      prisma.userCatDiscovery.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1' });
      prisma.ownership.findUnique.mockResolvedValue(null);
      prisma.ownership.create.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 100, level: 10 });

      await service.recordAction('u1', 'c1', 'discover_new');

      expect(prisma.ownership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          catId: 'c1',
          xp: 100,
          level: calculateLevel(100),
        }),
      });
    });

    it('does not create Ownership when UserCatDiscovery is missing', async () => {
      prisma.userCatDiscovery.findUnique.mockResolvedValue(null);
      prisma.ownership.findUnique.mockResolvedValue(null);

      const result = await service.recordAction('u1', 'c1', 'discover_new');

      expect(result.xpAwarded).toBe(100);
      expect(result.newLevel).toBe(0);
      expect(prisma.ownership.create).not.toHaveBeenCalled();
    });
  });

  describe('recordAction - scan', () => {
    it('awards 50 XP for scanning an existing cat', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 50, level: 1 });

      const result = await service.recordAction('u1', 'c1', 'scan');

      expect(result.xpAwarded).toBe(50);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { xp: { increment: 50 } },
      });
    });
  });

  describe('recordAction - donation', () => {
    it('awards XP equal to MYR amount (amountCents / 100)', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 10, level: 2 });

      const result = await service.recordAction('u1', 'c1', 'donation', 500); // 5 RM = 5 XP

      expect(result.xpAwarded).toBe(5);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { xp: { increment: 5 } },
      });
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
      // Currently at 5 XP (Lvl1), adding 50 XP should promote to higher level
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 5, level: 1 });

      const result = await service.recordAction('u1', 'c1', 'scan');

      // 5 + 50 = 55 XP → Lvl4
      expect(result.newLevel).toBe(4);
      expect(result.levelUp).toBe(true);
      expect(prisma.ownership.update).toHaveBeenCalledWith({
        where: { userId_catId: { userId: 'u1', catId: 'c1' } },
        data: { xp: 55, level: 4 },
      });
    });

    it('sends push notification on level-up', async () => {
      prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 5, level: 1 });

      await service.recordAction('u1', 'c1', 'scan');

      expect(alerts.notify).toHaveBeenCalledWith(
        'u1',
        'Level Up!',
        expect.stringContaining('Level 4'),
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
      prisma.ownership.create.mockResolvedValue({ userId: 'u1', catId: 'c1', xp: 50, level: 4 });

      const result = await service.recordAction('u1', 'c1', 'scan');

      expect(prisma.ownership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          xp: 50,
          level: 4, // calculateLevel(50) = 4
        }),
      });
      expect(result.levelUp).toBe(true); // new record at Lvl4 > 0
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
