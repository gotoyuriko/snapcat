import { PrismaClient } from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';

/**
 * Requirement 17 — Level Rewards.
 *
 * Grants a one-time reward when a User reaches an ownership level for a Cat:
 *   Lvl2 — RM3-off coupon (min purchase RM10)          (17.2)
 *   Lvl4 — one free Cat Kibble in donation inventory   (17.4)
 *   Lvl6 — one free Cat Snack in donation inventory    (17.6)
 *   Lvl8 — RM10-off coupon (min purchase RM30)         (17.8)
 *   Lvl9 — one free Tuna Can in donation inventory     (17.9)
 *   Lvl10 — staff order for a custom engraved keychain (17.10)
 * Lvl1 (ownership access), Lvl7 (medical unlock) and the badge tiers
 * (17.3/17.5/17.7/17.10) are handled elsewhere (gates + derived badges).
 *
 * Coupons are single-use and expire 30 days after grant (17.12).
 * A LevelRewardGrant row per user–cat–level guarantees exactly-once granting.
 */

/** Coupon lifetime in days (Req 17.12). */
export const COUPON_EXPIRY_DAYS = 30;

type RewardSpec =
  | { type: 'coupon'; amountOffCents: number; minPurchaseCents: number }
  | { type: 'free_item'; foodItemName: string }
  | { type: 'keychain_order' };

/** Reward per level (levels without an entry grant nothing here). */
export const LEVEL_REWARDS: Readonly<Record<number, RewardSpec>> = {
  2: { type: 'coupon', amountOffCents: 300, minPurchaseCents: 1000 },
  4: { type: 'free_item', foodItemName: 'Cat Kibble' },
  6: { type: 'free_item', foodItemName: 'Cat Snack' },
  8: { type: 'coupon', amountOffCents: 1000, minPurchaseCents: 3000 },
  9: { type: 'free_item', foodItemName: 'Tuna Can' },
  10: { type: 'keychain_order' },
};

export class LevelRewardsService {
  private prisma: PrismaClient;
  private alertsService: AlertsService;

  constructor(prisma?: PrismaClient, alertsService?: AlertsService) {
    this.prisma = prisma ?? new PrismaClient();
    this.alertsService = alertsService ?? new AlertsService();
  }

  /**
   * Grant rewards for every level crossed by a level-up, exactly once each.
   * Called after the Ownership level is committed (a single XP award can
   * cross several levels, e.g. a 100 XP discovery lands straight on Lvl3).
   */
  async grantForLevelUp(
    userId: string,
    catId: string,
    fromLevel: number,
    toLevel: number,
  ): Promise<void> {
    for (let level = fromLevel + 1; level <= toLevel; level++) {
      const spec = LEVEL_REWARDS[level];
      if (!spec) continue;

      // Exactly-once: the grant row's PK (userId, catId, level) makes a
      // repeat grant a no-op even across concurrent level evaluations.
      try {
        await this.prisma.levelRewardGrant.create({
          data: { userId, catId, level, rewardType: spec.type },
        });
      } catch {
        // Unique violation — this level's reward was already granted.
        continue;
      }

      await this.applyReward(userId, catId, level, spec);
    }
  }

  private async applyReward(
    userId: string,
    catId: string,
    level: number,
    spec: RewardSpec,
  ): Promise<void> {
    const now = new Date();

    if (spec.type === 'coupon') {
      await this.prisma.coupon.create({
        data: {
          userId,
          amountOffCents: spec.amountOffCents,
          minPurchaseCents: spec.minPurchaseCents,
          grantedForCatId: catId,
          grantedAtLevel: level,
          expiresAt: new Date(now.getTime() + COUPON_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        },
      });
      await this.notifySafely(
        userId,
        'Reward Unlocked!',
        `Level ${level} reward: RM${(spec.amountOffCents / 100).toFixed(0)} off ` +
          `your next purchase of RM${(spec.minPurchaseCents / 100).toFixed(0)} or more ` +
          `(valid ${COUPON_EXPIRY_DAYS} days).`,
      );
      return;
    }

    if (spec.type === 'free_item') {
      const foodItem = await this.prisma.foodItem.findFirst({
        where: { name: spec.foodItemName },
      });
      if (!foodItem) {
        // Catalogue item missing (e.g. unseeded dev DB) — the grant row still
        // records the entitlement; surface it rather than crash the level-up.
        console.error(
          `[level-rewards] food item "${spec.foodItemName}" not found; ` +
            `free-item reward for user ${userId} level ${level} not credited`,
        );
        return;
      }
      await this.prisma.userInventory.upsert({
        where: { userId_foodItemId: { userId, foodItemId: foodItem.id } },
        update: { quantity: { increment: 1 } },
        create: { userId, foodItemId: foodItem.id, quantity: 1 },
      });
      await this.notifySafely(
        userId,
        'Reward Unlocked!',
        `Level ${level} reward: one free ${spec.foodItemName} was added to your inventory.`,
      );
      return;
    }

    // keychain_order (Req 17.10): the grant row itself is the staff work item
    // (staff have no user records to push to — they query LevelRewardGrant
    // rows with rewardType 'keychain_order').
    console.log(
      `[level-rewards] STAFF: produce engraved keychain for user ${userId}, cat ${catId}`,
    );
    await this.notifySafely(
      userId,
      'Level 10 Reached!',
      'A custom engraved keychain with your cat’s name is being made for you!',
    );
  }

  /**
   * Everything the user has earned, for the My Rewards screen (Req 17.11):
   * level-reward grants plus coupons with their live status.
   */
  async getRewards(userId: string) {
    const [grants, coupons] = await Promise.all([
      this.prisma.levelRewardGrant.findMany({
        where: { userId },
        include: { cat: { select: { name: true } } },
        orderBy: { grantedAt: 'desc' },
      }),
      this.prisma.coupon.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const now = new Date();
    return {
      grants: grants.map((grant) => ({
        catId: grant.catId,
        catName: grant.cat?.name ?? null,
        level: grant.level,
        rewardType: grant.rewardType,
        grantedAt: grant.grantedAt,
      })),
      coupons: coupons.map((coupon) => ({
        id: coupon.id,
        amountOffCents: coupon.amountOffCents,
        minPurchaseCents: coupon.minPurchaseCents,
        grantedAtLevel: coupon.grantedAtLevel,
        expiresAt: coupon.expiresAt,
        status: coupon.usedAt ? 'used' : coupon.expiresAt < now ? 'expired' : 'active',
      })),
    };
  }

  /** Reward pushes are milestone notifications (Req 12.5 bypass). */
  private async notifySafely(userId: string, title: string, body: string): Promise<void> {
    try {
      await this.alertsService.notifyMilestone(userId, title, body);
    } catch {
      // A push failure must never fail the level-up that triggered it.
    }
  }
}
