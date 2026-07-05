import {
  LevelRewardsService,
  LEVEL_REWARDS,
  COUPON_EXPIRY_DAYS,
} from '../level-rewards.service';

function createMockPrisma() {
  return {
    levelRewardGrant: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    coupon: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
    foodItem: {
      findFirst: jest.fn().mockResolvedValue({ id: 'food-1', name: 'Cat Kibble' }),
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

describe('LevelRewardsService.grantForLevelUp (Req 17)', () => {
  let prisma: any;
  let alerts: any;
  let service: LevelRewardsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    alerts = createMockAlerts();
    service = new LevelRewardsService(prisma, alerts);
  });

  it('Lvl2 grants an RM3-off coupon with min purchase RM10 expiring in 30 days (Req 17.2, 17.12)', async () => {
    const before = Date.now();
    await service.grantForLevelUp('u1', 'c1', 1, 2);

    expect(prisma.levelRewardGrant.create).toHaveBeenCalledWith({
      data: { userId: 'u1', catId: 'c1', level: 2, rewardType: 'coupon' },
    });
    expect(prisma.coupon.create).toHaveBeenCalledTimes(1);
    const couponData = prisma.coupon.create.mock.calls[0][0].data;
    expect(couponData).toMatchObject({
      userId: 'u1',
      amountOffCents: 300,
      minPurchaseCents: 1000,
      grantedForCatId: 'c1',
      grantedAtLevel: 2,
    });
    const expectedExpiry = before + COUPON_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    expect(couponData.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000);
    expect(couponData.expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 60_000);
  });

  it('Lvl8 grants an RM10-off coupon with min purchase RM30 (Req 17.8)', async () => {
    await service.grantForLevelUp('u1', 'c1', 7, 8);

    expect(prisma.coupon.create.mock.calls[0][0].data).toMatchObject({
      amountOffCents: 1000,
      minPurchaseCents: 3000,
    });
  });

  it.each([
    [4, 'Cat Kibble'],
    [6, 'Cat Snack'],
    [9, 'Tuna Can'],
  ])('Lvl%i grants one free %s to the donation inventory (Req 17.4/17.6/17.9)', async (level, itemName) => {
    prisma.foodItem.findFirst.mockResolvedValue({ id: 'food-x', name: itemName });

    await service.grantForLevelUp('u1', 'c1', level - 1, level);

    expect(prisma.foodItem.findFirst).toHaveBeenCalledWith({ where: { name: itemName } });
    expect(prisma.userInventory.upsert).toHaveBeenCalledWith({
      where: { userId_foodItemId: { userId: 'u1', foodItemId: 'food-x' } },
      update: { quantity: { increment: 1 } },
      create: { userId: 'u1', foodItemId: 'food-x', quantity: 1 },
    });
  });

  it('Lvl10 records a keychain order grant for the staff team (Req 17.10)', async () => {
    await service.grantForLevelUp('u1', 'c1', 9, 10);

    expect(prisma.levelRewardGrant.create).toHaveBeenCalledWith({
      data: { userId: 'u1', catId: 'c1', level: 10, rewardType: 'keychain_order' },
    });
    expect(alerts.notifyMilestone).toHaveBeenCalled();
  });

  it('a multi-level jump grants every crossed reward exactly once', async () => {
    // 0 → 4 crosses levels 1..4; rewards exist at 2 (coupon) and 4 (free item)
    await service.grantForLevelUp('u1', 'c1', 0, 4);

    const grantedLevels = prisma.levelRewardGrant.create.mock.calls.map(
      (call: any[]) => call[0].data.level,
    );
    expect(grantedLevels).toEqual([2, 4]);
    expect(prisma.coupon.create).toHaveBeenCalledTimes(1);
    expect(prisma.userInventory.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not re-apply a reward whose grant row already exists (exactly-once)', async () => {
    prisma.levelRewardGrant.create.mockRejectedValue(new Error('Unique constraint failed'));

    await service.grantForLevelUp('u1', 'c1', 1, 2);

    expect(prisma.coupon.create).not.toHaveBeenCalled();
    expect(alerts.notifyMilestone).not.toHaveBeenCalled();
  });

  it('a missing catalogue item logs the entitlement without crashing the level-up', async () => {
    prisma.foodItem.findFirst.mockResolvedValue(null);

    await expect(service.grantForLevelUp('u1', 'c1', 3, 4)).resolves.toBeUndefined();
    expect(prisma.userInventory.upsert).not.toHaveBeenCalled();
  });

  it('levels without a reward entry grant nothing', async () => {
    await service.grantForLevelUp('u1', 'c1', 2, 3); // Lvl3 = badge only

    expect(prisma.levelRewardGrant.create).not.toHaveBeenCalled();
  });

  it('the reward table matches Requirement 17 exactly', () => {
    expect(LEVEL_REWARDS[2]).toEqual({ type: 'coupon', amountOffCents: 300, minPurchaseCents: 1000 });
    expect(LEVEL_REWARDS[4]).toEqual({ type: 'free_item', foodItemName: 'Cat Kibble' });
    expect(LEVEL_REWARDS[6]).toEqual({ type: 'free_item', foodItemName: 'Cat Snack' });
    expect(LEVEL_REWARDS[8]).toEqual({ type: 'coupon', amountOffCents: 1000, minPurchaseCents: 3000 });
    expect(LEVEL_REWARDS[9]).toEqual({ type: 'free_item', foodItemName: 'Tuna Can' });
    expect(LEVEL_REWARDS[10]).toEqual({ type: 'keychain_order' });
    expect(Object.keys(LEVEL_REWARDS)).toHaveLength(6);
  });
});

describe('LevelRewardsService.getRewards (Req 17.11)', () => {
  it('returns grants and coupons with live active/used/expired status', async () => {
    const prisma = createMockPrisma();
    const now = Date.now();
    prisma.levelRewardGrant.findMany.mockResolvedValue([
      {
        userId: 'u1',
        catId: 'c1',
        level: 2,
        rewardType: 'coupon',
        grantedAt: new Date(now),
        cat: { name: 'Whiskers' },
      },
    ]);
    prisma.coupon.findMany.mockResolvedValue([
      { id: 'cp-active', amountOffCents: 300, minPurchaseCents: 1000, grantedAtLevel: 2, expiresAt: new Date(now + 86400000), usedAt: null, createdAt: new Date(now) },
      { id: 'cp-used', amountOffCents: 300, minPurchaseCents: 1000, grantedAtLevel: 2, expiresAt: new Date(now + 86400000), usedAt: new Date(now), createdAt: new Date(now) },
      { id: 'cp-expired', amountOffCents: 1000, minPurchaseCents: 3000, grantedAtLevel: 8, expiresAt: new Date(now - 1000), usedAt: null, createdAt: new Date(now) },
    ]);

    const service = new LevelRewardsService(prisma, createMockAlerts());
    const rewards = await service.getRewards('u1');

    expect(rewards.grants).toEqual([
      expect.objectContaining({ catName: 'Whiskers', level: 2, rewardType: 'coupon' }),
    ]);
    expect(rewards.coupons.map((c) => c.status)).toEqual(['active', 'used', 'expired']);
  });
});
