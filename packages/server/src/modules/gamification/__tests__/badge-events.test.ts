/**
 * Requirement 18.2 — badge-earned detection, push notification, and the
 * badgesEarned payload the client uses for the congratulatory animation.
 * Requirement 18.6 — badge catalogue with criteria and progress.
 */
import { GamificationService } from '../gamification.service';

function createMockPrisma() {
  return {
    user: {
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
    },
    ownership: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    userCatDiscovery: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'u1', catId: 'c1' }),
      count: jest.fn().mockResolvedValue(0),
    },
    cat: {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1', name: 'Whiskers' }),
    },
    donation: {
      count: jest.fn().mockResolvedValue(0),
    },
    donationXpLog: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { xpAwarded: 0 } }),
      create: jest.fn().mockResolvedValue({}),
    },
    scanXpLog: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    levelRewardGrant: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    coupon: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    foodItem: {
      findFirst: jest.fn().mockResolvedValue({ id: 'f1', name: 'Cat Kibble' }),
    },
    userInventory: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

function createMockAlerts() {
  return {
    notify: jest.fn().mockResolvedValue(undefined),
    notifyMilestone: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('Global milestone badge events (Req 18.2)', () => {
  let prisma: any;
  let alerts: any;
  let service: GamificationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    alerts = createMockAlerts();
    service = new GamificationService(prisma, alerts);
    // Existing Lvl1 ownership so donations don't create new records
    prisma.ownership.findUnique.mockResolvedValue({
      userId: 'u1', catId: 'c1', level: 1, xp: 3,
    });
  });

  it('the first donation earns the First Donation badge and sends a push', async () => {
    prisma.donation.count.mockResolvedValue(1); // this donation is the first

    const result = await service.recordAction('u1', 'c1', 'donation', 500);

    expect(result.badgesEarned).toEqual([
      expect.objectContaining({ id: 'first-donation', title: 'First Donation' }),
    ]);
    expect(alerts.notifyMilestone).toHaveBeenCalledWith(
      'u1',
      'Badge Earned! 🏅',
      expect.stringContaining('First Donation'),
    );
  });

  it('the 100th donation earns the 100 Total Donations badge', async () => {
    prisma.donation.count.mockResolvedValue(100);

    const result = await service.recordAction('u1', 'c1', 'donation', 500);

    expect(result.badgesEarned).toEqual([
      expect.objectContaining({ id: 'donations-100' }),
    ]);
  });

  it('an in-between donation earns nothing', async () => {
    prisma.donation.count.mockResolvedValue(37);

    const result = await service.recordAction('u1', 'c1', 'donation', 500);

    expect(result.badgesEarned).toBeUndefined();
    const badgePushes = alerts.notifyMilestone.mock.calls.filter(
      (call: string[]) => call[1] === 'Badge Earned! 🏅',
    );
    expect(badgePushes).toHaveLength(0);
  });

  it('a donation past the daily XP cap still earns the badge (0 XP, badge kept)', async () => {
    prisma.donation.count.mockResolvedValue(1);
    prisma.donationXpLog.aggregate.mockResolvedValue({ _sum: { xpAwarded: 200 } }); // cap hit

    const result = await service.recordAction('u1', 'c1', 'donation', 500);

    expect(result.xpAwarded).toBe(0);
    expect(result.badgesEarned).toEqual([
      expect.objectContaining({ id: 'first-donation' }),
    ]);
  });

  it('the 10th discovery earns the Discovered 10 Cats badge', async () => {
    prisma.userCatDiscovery.count.mockResolvedValue(10);
    // discovery creates the ownership record fresh
    prisma.ownership.findUnique.mockResolvedValue(null);
    prisma.ownership.create.mockResolvedValue({ userId: 'u1', catId: 'c1', level: 5, xp: 100 });

    const result = await service.recordAction('u1', 'c1', 'discover_new');

    expect(result.badgesEarned).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'discovered-10' })]),
    );
  });

  it('badge detection failure never fails the XP award', async () => {
    prisma.donation.count.mockRejectedValue(new Error('db down'));

    const result = await service.recordAction('u1', 'c1', 'donation', 500);

    expect(result.xpAwarded).toBe(5);
    expect(result.badgesEarned).toBeUndefined();
  });
});

describe('Per-cat tier badge events (Req 18.2, 18.4, 18.5)', () => {
  let prisma: any;
  let alerts: any;
  let service: GamificationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    alerts = createMockAlerts();
    service = new GamificationService(prisma, alerts);
  });

  it('crossing Lvl3 earns the bronze badge featuring the cat', async () => {
    prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', level: 2, xp: 15 });

    // +1 XP → 16 XP → Lvl3
    const result = await service.recordAction('u1', 'c1', 'donation', 100);

    expect(result.newLevel).toBe(3);
    expect(result.badgesEarned).toEqual([
      expect.objectContaining({ id: 'cat-bronze-c1', title: 'Bronze Badge — Whiskers' }),
    ]);
    expect(alerts.notifyMilestone).toHaveBeenCalledWith(
      'u1',
      'Badge Earned! 🏅',
      expect.stringContaining('Bronze Badge — Whiskers'),
    );
  });

  it('a multi-level jump earns every tier crossed', async () => {
    // New ownership created straight at Lvl5 by a 100 XP discovery
    prisma.ownership.findUnique.mockResolvedValue(null);
    prisma.ownership.create.mockResolvedValue({ userId: 'u1', catId: 'c1', level: 5, xp: 100 });

    const result = await service.recordAction('u1', 'c1', 'discover_new');

    expect(result.badgesEarned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'cat-bronze-c1' }),
        expect.objectContaining({ id: 'cat-silver-c1' }),
      ]),
    );
  });

  it('a level-up below Lvl3 earns no tier badge', async () => {
    prisma.ownership.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1', level: 0, xp: 0 });

    // +1 XP → Lvl1
    const result = await service.recordAction('u1', 'c1', 'donation', 100);

    expect(result.levelUp).toBe(true);
    expect(result.badgesEarned).toBeUndefined();
  });
});

describe('Badge catalogue (Req 18.6)', () => {
  it('returns every badge with criteria, target, progress, and earned state', async () => {
    const prisma = createMockPrisma();
    prisma.userCatDiscovery.count.mockResolvedValue(12);
    prisma.donation.count.mockResolvedValue(3);
    prisma.ownership.findMany.mockResolvedValue([{ level: 7 }, { level: 3 }, { level: 1 }]);

    const service = new GamificationService(prisma, createMockAlerts());
    const { badges } = await service.getBadgeCatalogue('u1');

    const byId = Object.fromEntries(badges.map((b: any) => [b.id, b]));

    // Globals
    expect(byId['first-donation']).toMatchObject({ earned: true, progress: 1, target: 1 });
    expect(byId['donations-100']).toMatchObject({ earned: false, progress: 3, target: 100 });
    expect(byId['discovered-10']).toMatchObject({ earned: true, progress: 10, target: 10 });
    expect(byId['discovered-50']).toMatchObject({ earned: false, progress: 12, target: 50 });

    // Per-cat tiers: highest level is 7 → bronze/silver/gold earned, diamond not
    expect(byId['tier-bronze']).toMatchObject({ earned: true, earnedCount: 2 });
    expect(byId['tier-gold']).toMatchObject({ earned: true, earnedCount: 1, progress: 7 });
    expect(byId['tier-diamond']).toMatchObject({ earned: false, progress: 7, target: 10 });

    // Every entry carries catalogue fields
    for (const badge of badges) {
      expect(typeof (badge as any).criteria).toBe('string');
      expect(typeof (badge as any).target).toBe('number');
      expect(typeof (badge as any).progress).toBe('number');
    }
  });
});
