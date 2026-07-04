import { PrismaClient } from '@prisma/client';
import { GamificationAction, XPResult } from '@codingkitty/shared';
import { AlertsService } from '../alerts/alerts.service';

/**
 * Ownership level thresholds (cumulative per-cat XP).
 * Index = level, value = minimum cumulative XP required.
 */
// Requirement 6.6: Lvl1 = 1 XP, then each level's increment grows by 5
// (Lvl2 = +5, Lvl3 = +10, … Lvl10 = +45).
const LEVEL_THRESHOLDS: readonly number[] = [
  0,    // Lvl0 — Discovered
  1,    // Lvl1 — Owner (unlocks chat + notifications)
  6,    // Lvl2
  16,   // Lvl3
  31,   // Lvl4
  51,   // Lvl5
  76,   // Lvl6
  106,  // Lvl7 — unlocks medical/grooming requests
  141,  // Lvl8
  181,  // Lvl9
  226,  // Lvl10 — Max level
];

/** XP awarded per non-donation action (Requirements 6.1, 6.2, 6.4) */
const ACTION_XP: Record<Exclude<GamificationAction, 'donation'>, number> = {
  discover_new: 100,
  scan: 3,
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
   * Scan XP is awarded once per unique daily scan per user per cat (Req 6.2).
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
        return this.zeroResult(userId, catId);
      }
    } else if (action === 'scan') {
      // Requirement 6.2: 3 XP once per unique daily scan per cat
      const alreadyAwardedToday = await this.hasScanXpToday(userId, catId);
      if (alreadyAwardedToday) {
        return this.zeroResult(userId, catId);
      }
      xpToAward = ACTION_XP.scan;
    } else {
      xpToAward = ACTION_XP[action];
    }

    // 2. Update global User.xp — only discovery awards global XP (Req 6.1);
    //    scans, donations, and medical reimbursements award per-cat XP only
    //    (Reqs 6.2–6.4).
    if (action === 'discover_new') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { xp: { increment: xpToAward } },
      });
    }

    // 3. Update per-cat Ownership XP and evaluate level promotion
    const result = await this.updateOwnershipXP(userId, catId, xpToAward);

    // 4. Log awards that carry a daily limit so future calls can enforce it
    if (action === 'donation') {
      await this.recordDonationXpEntry(userId, catId, xpToAward);
    } else if (action === 'scan') {
      await this.recordScanXpEntry(userId, catId, xpToAward);
    }

    return result;
  }

  /** XPResult for a call that awards nothing, reporting the current level. */
  private async zeroResult(userId: string, catId: string): Promise<XPResult> {
    const ownership = await this.prisma.ownership.findUnique({
      where: { userId_catId: { userId, catId } },
    });
    return { xpAwarded: 0, newLevel: ownership?.level ?? 0, levelUp: false };
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
   * Whether scan XP was already awarded today (UTC) for a user–cat pair.
   * Uses the ScanXpLog table for tracking (Requirement 6.2).
   */
  private async hasScanXpToday(userId: string, catId: string): Promise<boolean> {
    const count = await this.prisma.scanXpLog.count({
      where: {
        userId,
        catId,
        createdAt: {
          gte: getUtcDayStart(),
          lt: getUtcDayEnd(),
        },
      },
    });
    return count > 0;
  }

  /**
   * Records a scan XP entry for once-per-day tracking.
   */
  private async recordScanXpEntry(
    userId: string,
    catId: string,
    xpAwarded: number,
  ): Promise<void> {
    await this.prisma.scanXpLog.create({
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
   * Earned badges for a user's profile showcase (Requirements 18.3–18.5).
   * Badges are derived from existing data rather than stored:
   * - Global badges from aggregate activity (discoveries, donations).
   * - Per-cat level badges (Requirement 17): highest tier only per cat —
   *   bronze at Lvl3, silver at Lvl5, gold at Lvl7, diamond at Lvl10.
   */
  async getUserBadges(userId: string) {
    const [catsDiscovered, donationCount, ownerships] = await Promise.all([
      this.prisma.userCatDiscovery.count({ where: { userId } }),
      this.prisma.donation.count({
        where: { donorId: userId, status: { in: ['escrowed', 'released'] } },
      }),
      this.prisma.ownership.findMany({
        where: { userId, level: { gte: 3 } },
        include: { cat: { select: { id: true, name: true, photoUrl: true } } },
      }),
    ]);

    const globalBadges = GLOBAL_BADGE_DEFS.filter((def) =>
      def.earned({ catsDiscovered, donationCount }),
    ).map(({ id, title, icon }) => ({ id, title, icon, type: 'global' as const }));

    const catBadges = ownerships.map((o) => {
      const tier =
        o.level >= 10 ? 'diamond' : o.level >= 7 ? 'gold' : o.level >= 5 ? 'silver' : 'bronze';
      return {
        id: `cat-${tier}-${o.catId}`,
        title: `${o.cat.name ?? 'Unnamed cat'} — ${tier[0].toUpperCase()}${tier.slice(1)}`,
        icon: 'ribbon',
        type: 'per-cat' as const,
        tier,
        catId: o.cat.id,
        catName: o.cat.name,
        catPhotoUrl: o.cat.photoUrl,
      };
    });

    return { badges: [...globalBadges, ...catBadges] };
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

// Requirement 18.1 milestone badges. Earned-state is a pure function of
// aggregate counts so no badge table or backfill is needed.
const GLOBAL_BADGE_DEFS: ReadonlyArray<{
  id: string;
  title: string;
  icon: string;
  earned: (s: { catsDiscovered: number; donationCount: number }) => boolean;
}> = [
  { id: 'first-donation', title: 'First Donation', icon: 'heart', earned: (s) => s.donationCount >= 1 },
  { id: 'donations-100', title: '100 Total Donations', icon: 'heart-circle', earned: (s) => s.donationCount >= 100 },
  { id: 'discovered-10', title: 'Discovered 10 Cats', icon: 'paw', earned: (s) => s.catsDiscovered >= 10 },
  { id: 'discovered-50', title: 'Discovered 50 Cats', icon: 'paw', earned: (s) => s.catsDiscovered >= 50 },
];

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
