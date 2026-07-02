import { PrismaClient } from '@prisma/client';
import { GamificationAction, XPResult } from '@codingkitty/shared';
import { AlertsService } from '../alerts/alerts.service';

/**
 * Ownership level thresholds (cumulative per-cat XP).
 * Index = level, value = minimum cumulative XP required.
 */
const LEVEL_THRESHOLDS: readonly number[] = [
  0,    // Lvl0 — Discovered
  1,    // Lvl1 — Owner (unlocks chat + medical)
  6,    // Lvl2
  16,   // Lvl3
  31,   // Lvl4
  56,   // Lvl5
  96,   // Lvl6
  156,  // Lvl7
  236,  // Lvl8
  336,  // Lvl9
  486,  // Lvl10 — Max level
];

/** XP awarded per non-donation action */
const ACTION_XP: Record<Exclude<GamificationAction, 'donation'>, number> = {
  discover_new: 100,
  scan: 50,
  medical_reimbursed: 100,
};

/** Maximum donation XP per user per cat per day (UTC) */
const DAILY_DONATION_XP_CAP = 200;

/**
 * Calculates the ownership level for a given cumulative XP value.
 * Returns the highest level whose threshold is <= xp.
 */
export function calculateLevel(xp: number): number {
  let level = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) {
      level = i;
      break;
    }
  }
  return level;
}

export class GamificationService {
  private prisma: PrismaClient;
  private alertsService: AlertsService;

  constructor(prisma: PrismaClient, alertsService?: AlertsService) {
    this.prisma = prisma;
    this.alertsService = alertsService ?? new AlertsService();
  }

  /**
   * Records a gamification action, awards XP, updates ownership level.
   *
   * For donation actions, `amountCents` is required (XP = amountCents / 100).
   * Donation XP is capped at 200/day per user per cat.
   */
  async recordAction(
    userId: string,
    catId: string,
    action: GamificationAction,
    amountCents?: number,
  ): Promise<XPResult> {
    // 1. Determine base XP to award
    let xpToAward: number;

    if (action === 'donation') {
      if (amountCents == null || amountCents <= 0) {
        return { xpAwarded: 0, newLevel: 0, levelUp: false };
      }
      // XP = price in MYR (amountCents / 100)
      const rawXp = Math.floor(amountCents / 100);
      // Enforce daily donation cap: 200 XP/day per user per cat
      const todayDonationXp = await this.getTodayDonationXp(userId, catId);
      const remainingCap = Math.max(0, DAILY_DONATION_XP_CAP - todayDonationXp);
      xpToAward = Math.min(rawXp, remainingCap);

      if (xpToAward <= 0) {
        // Cap already reached — no XP awarded
        const ownership = await this.prisma.ownership.findUnique({
          where: { userId_catId: { userId, catId } },
        });
        return {
          xpAwarded: 0,
          newLevel: ownership?.level ?? 0,
          levelUp: false,
        };
      }
    } else {
      xpToAward = ACTION_XP[action];
    }

    // 2. Update global User.xp
    await this.prisma.user.update({
      where: { id: userId },
      data: { xp: { increment: xpToAward } },
    });

    // 3. Update per-cat Ownership XP and evaluate level promotion
    const result = await this.updateOwnershipXP(userId, catId, xpToAward);

    // 4. Record donation XP in Donation table for daily cap tracking is handled
    //    externally by the Donation module — we only track via Ownership.xp here.
    //    For donation cap tracking, we use a lightweight record.
    if (action === 'donation') {
      await this.recordDonationXpEntry(userId, catId, xpToAward);
    }

    return result;
  }

  /**
   * Updates per-cat ownership XP and evaluates level promotion/demotion.
   * Creates Ownership record at Lvl1 if absent (requires UserCatDiscovery to exist).
   * Sends push notification AFTER DB commits on level-up.
   */
  private async updateOwnershipXP(
    userId: string,
    catId: string,
    xpToAdd: number,
  ): Promise<XPResult> {
    // Check if Ownership record exists
    let ownership = await this.prisma.ownership.findUnique({
      where: { userId_catId: { userId, catId } },
    });

    if (!ownership) {
      // Verify UserCatDiscovery record exists before creating Ownership
      const discovery = await this.prisma.userCatDiscovery.findUnique({
        where: { userId_catId: { userId, catId } },
      });

      if (!discovery) {
        // Cannot create ownership without discovery — return zero result
        return { xpAwarded: xpToAdd, newLevel: 0, levelUp: false };
      }

      // Create Ownership record with the awarded XP
      ownership = await this.prisma.ownership.create({
        data: {
          userId,
          catId,
          xp: xpToAdd,
          level: calculateLevel(xpToAdd),
          since: new Date(),
        },
      });

      const newLevel = ownership.level;
      const levelUp = newLevel > 0;

      // Send push notification AFTER DB commit for level-up
      if (levelUp) {
        await this.sendLevelUpNotification(userId, catId, newLevel);
      }

      return { xpAwarded: xpToAdd, newLevel, levelUp };
    }

    // Ownership exists — increment XP
    const previousLevel = ownership.level;
    const newXp = ownership.xp + xpToAdd;
    const newLevel = calculateLevel(newXp);

    // Update ownership record with new XP and level
    await this.prisma.ownership.update({
      where: { userId_catId: { userId, catId } },
      data: {
        xp: newXp,
        level: newLevel,
      },
    });

    const levelUp = newLevel > previousLevel;

    // Send push notification AFTER DB commit for level-up
    if (levelUp) {
      await this.sendLevelUpNotification(userId, catId, newLevel);
    }

    return { xpAwarded: xpToAdd, newLevel, levelUp };
  }

  /**
   * Get ownership for a user–cat pair.
   */
  async getOwnership(userId: string, catId: string) {
    return this.prisma.ownership.findUnique({
      where: { userId_catId: { userId, catId } },
    });
  }

  /**
   * Sends a push notification for level-up events.
   * Called AFTER DB commits are complete.
   * Uses notifyMilestone to bypass the rate limit (Requirement 12.5).
   */
  private async sendLevelUpNotification(
    userId: string,
    catId: string,
    newLevel: number,
  ): Promise<void> {
    try {
      const cat = await this.prisma.cat.findUnique({ where: { id: catId } });
      const catName = cat?.name ?? 'a cat';
      if (this.alertsService.notifyMilestone) {
        await this.alertsService.notifyMilestone(
          userId,
          'Level Up!',
          `You reached Level ${newLevel} for ${catName}!`,
          { catId, level: String(newLevel) },
        );
      } else {
        await this.alertsService.notify(
          userId,
          'Level Up!',
          `You reached Level ${newLevel} for ${catName}!`,
          { catId, level: String(newLevel) },
        );
      }
    } catch {
      // Notification failure should not break the XP flow
    }
  }

  /**
   * Gets the total donation XP already awarded today (UTC) for a user–cat pair.
   * Uses the DonationXpLog table for tracking.
   */
  private async getTodayDonationXp(userId: string, catId: string): Promise<number> {
    const todayStart = getUtcDayStart();
    const todayEnd = getUtcDayEnd();

    const result = await this.prisma.donationXpLog.aggregate({
      where: {
        userId,
        catId,
        createdAt: {
          gte: todayStart,
          lt: todayEnd,
        },
      },
      _sum: {
        xpAwarded: true,
      },
    });

    return result._sum.xpAwarded ?? 0;
  }

  /**
   * Records a donation XP entry for daily cap tracking.
   */
  private async recordDonationXpEntry(
    userId: string,
    catId: string,
    xpAwarded: number,
  ): Promise<void> {
    await this.prisma.donationXpLog.create({
      data: {
        userId,
        catId,
        xpAwarded,
      },
    });
  }

  /**
   * Calculate level from XP (exposed for external use).
   */
  calculateLevel(xp: number): number {
    return calculateLevel(xp);
  }

  /**
   * Global profile stats for a user: total XP, cats discovered/owned, and
   * rank among all users by total XP. Powers the client Profile screen.
   */
  async getUserStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, email: true, xp: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const [catsDiscovered, catsOwned, higherXpCount] = await Promise.all([
      this.prisma.userCatDiscovery.count({ where: { userId } }),
      this.prisma.ownership.count({ where: { userId, level: { gte: 1 } } }),
      this.prisma.user.count({ where: { xp: { gt: user.xp } } }),
    ]);

    return {
      userId: user.id,
      displayName: user.displayName,
      email: user.email,
      xp: user.xp,
      catsDiscovered,
      catsOwned,
      rank: higherXpCount + 1,
    };
  }

  /**
   * Global leaderboard — top users ranked by total XP.
   */
  async getLeaderboard(limit = 20) {
    const users = await this.prisma.user.findMany({
      orderBy: { xp: 'desc' },
      take: limit,
      select: { id: true, displayName: true, xp: true },
    });

    return users.map((user, index) => ({
      userId: user.id,
      displayName: user.displayName,
      xp: user.xp,
      rank: index + 1,
    }));
  }
}

/** Returns the start of the current UTC day */
function getUtcDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
}

/** Returns the start of the next UTC day */
function getUtcDayEnd(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}
