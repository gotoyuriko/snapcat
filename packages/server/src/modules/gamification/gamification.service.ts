import { PrismaClient } from '@prisma/client';
import { EarnedBadge, GamificationAction, XPResult } from '@codingkitty/shared';
import { AlertsService } from '../alerts/alerts.service';
import { LevelRewardsService } from './level-rewards.service';

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
  // Discovery awards exactly the Lvl3 ownership threshold (16 XP ≙ RM16):
  // the first discoverer starts at ownership Level 3, and the same 16 XP is
  // what lands on their global profile XP. 100 XP was deemed too much.
  discover_new: 16,
  scan: 3,
  medical_reimbursed: 100,
};

/** Maximum donation XP per user per cat per day (UTC) */
const DAILY_DONATION_XP_CAP = 200;

/**
 * Per-level rewards (Requirement 17.11): free food items granted to the
 * user's inventory when an ownership crosses the level, plus display-only
 * perks (badges, feature unlocks) shown on the Level Rewards page.
 */
export interface LevelReward {
  level: number;
  xpRequired: number;
  items: Array<{ name: string; quantity: number }>;
  perks: string[];
}

export const LEVEL_REWARDS: LevelReward[] = [
  { level: 1, xpRequired: 1, items: [], perks: ['Official Owner status — join the cat\'s leaderboard and community chat'] },
  { level: 2, xpRequired: 6, items: [{ name: 'Cat Kibble', quantity: 1 }], perks: [] },
  { level: 3, xpRequired: 16, items: [{ name: 'Cat Kibble', quantity: 1 }], perks: ['Bronze cat badge on your profile'] },
  { level: 4, xpRequired: 31, items: [{ name: 'Cat Snack', quantity: 1 }], perks: [] },
  { level: 5, xpRequired: 51, items: [{ name: 'Cat Snack', quantity: 1 }], perks: ['Silver cat badge on your profile'] },
  { level: 6, xpRequired: 76, items: [{ name: 'Tuna Can', quantity: 1 }], perks: [] },
  { level: 7, xpRequired: 106, items: [{ name: 'Tuna Can', quantity: 1 }], perks: ['Gold cat badge on your profile', 'Unlocks medical & grooming care requests'] },
  { level: 8, xpRequired: 141, items: [{ name: 'Cat Snack', quantity: 2 }], perks: [] },
  { level: 9, xpRequired: 181, items: [{ name: 'Tuna Can', quantity: 2 }], perks: [] },
  { level: 10, xpRequired: 226, items: [{ name: 'Tuna Can', quantity: 3 }], perks: ['Diamond cat badge — max level reached!'] },
];

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
  private levelRewardsService: LevelRewardsService;

  constructor(
    prisma: PrismaClient,
    alertsService?: AlertsService,
    levelRewardsService?: LevelRewardsService,
  ) {
    this.prisma = prisma;
    this.alertsService = alertsService ?? new AlertsService();
    this.levelRewardsService =
      levelRewardsService ?? new LevelRewardsService(prisma, this.alertsService);
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
    // Requirement 16.1/16.4: donations and scans count as owner activity for
    // this cat — refresh the inactivity clock BEFORE the daily-cap early
    // returns below, so a capped scan/donation still counts as activity.
    // Only a re-scan lifts an existing revocation (Req 16.4).
    if (action === 'scan' || action === 'donation') {
      await this.refreshOwnerActivity(userId, catId, action === 'scan');
    }

    // Requirement 18.2: detect milestone badges crossed by this exact action.
    // The Donation / UserCatDiscovery record is already committed by the
    // caller, so counting now tells us whether this action hit a threshold.
    // Detected before the daily-cap early returns — a capped donation is
    // still a donation for badge purposes.
    const globalBadges = await this.detectGlobalBadges(userId, action);

    // 1. Determine base XP to award
    let xpToAward: number;

    if (action === 'donation') {
      if (amountCents == null || amountCents <= 0) {
        return this.withBadges({ xpAwarded: 0, newLevel: 0, levelUp: false }, userId, globalBadges);
      }
      // XP = price in MYR (amountCents / 100)
      const rawXp = Math.floor(amountCents / 100);
      // Enforce daily donation cap: 200 XP/day per user per cat
      const todayDonationXp = await this.getTodayDonationXp(userId, catId);
      const remainingCap = Math.max(0, DAILY_DONATION_XP_CAP - todayDonationXp);
      xpToAward = Math.min(rawXp, remainingCap);

      if (xpToAward <= 0) {
        // Cap already reached — no XP awarded
        return this.withBadges(await this.zeroResult(userId, catId), userId, globalBadges);
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
      // The same 16 XP also seeds the ownership ladder — the first
      // discoverer starts at exactly Level 3. Global milestone badges
      // (e.g. "Discovered 10 Cats") ride along with the result (Req 18.2).
      const discoveryResult = await this.updateOwnershipXP(userId, catId, xpToAward);
      return this.withBadges(discoveryResult, userId, globalBadges);
    }

    // 3. Update per-cat Ownership XP and evaluate level promotion
    const result = await this.updateOwnershipXP(userId, catId, xpToAward);

    // 4. Log awards that carry a daily limit so future calls can enforce it
    if (action === 'donation') {
      await this.recordDonationXpEntry(userId, catId, xpToAward);
    } else if (action === 'scan') {
      await this.recordScanXpEntry(userId, catId, xpToAward);
    }

    return this.withBadges(result, userId, globalBadges);
  }

  /**
   * Requirement 18.2: milestone badges whose threshold is crossed by this
   * exact action. Badges are derived (no badge table), so "newly earned"
   * means the post-action count equals the threshold exactly.
   */
  private async detectGlobalBadges(
    userId: string,
    action: GamificationAction,
  ): Promise<EarnedBadge[]> {
    try {
      if (action === 'donation') {
        const donationCount = await this.prisma.donation.count({
          where: { donorId: userId, status: { in: ['escrowed', 'released'] } },
        });
        return GLOBAL_BADGE_DEFS.filter(
          (def) => def.metric === 'donations' && donationCount === def.target,
        ).map(({ id, title, icon }) => ({ id, title, icon }));
      }
      if (action === 'discover_new') {
        const catsDiscovered = await this.prisma.userCatDiscovery.count({ where: { userId } });
        return GLOBAL_BADGE_DEFS.filter(
          (def) => def.metric === 'discoveries' && catsDiscovered === def.target,
        ).map(({ id, title, icon }) => ({ id, title, icon }));
      }
    } catch {
      // Badge detection must never fail the XP award itself.
    }
    return [];
  }

  /**
   * Merge global badges into an XPResult (per-cat tier badges are added by
   * updateOwnershipXP) and send one push per newly earned badge (Req 18.2).
   */
  private async withBadges(
    result: XPResult,
    userId: string,
    globalBadges: EarnedBadge[],
  ): Promise<XPResult> {
    const badgesEarned = [...globalBadges, ...(result.badgesEarned ?? [])];
    if (badgesEarned.length === 0) {
      return result;
    }
    for (const badge of globalBadges) {
      try {
        await this.alertsService.notifyMilestone(
          userId,
          'Badge Earned! 🏅',
          `You earned the "${badge.title}" badge!`,
        );
      } catch {
        // Push failure must never fail the XP award.
      }
    }
    return { ...result, badgesEarned };
  }

  /**
   * Requirement 16: mark the owner as active for this cat.
   * Refreshes lastActiveAt and clears any pending inactivity warning.
   * When `restoreRevocation` is true (scans only, Req 16.4), also lifts
   * revocation — restoring the previously attained level and all privileges
   * without re-earning XP (level/xp were never zeroed).
   * No-op when no Ownership record exists.
   */
  private async refreshOwnerActivity(
    userId: string,
    catId: string,
    restoreRevocation: boolean,
  ): Promise<void> {
    await this.prisma.ownership.updateMany({
      where: { userId, catId },
      data: {
        lastActiveAt: new Date(),
        inactivityWarnedAt: null,
        ...(restoreRevocation ? { revokedAt: null } : {}),
      },
    });
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
      let badgesEarned: EarnedBadge[] | undefined;

      // Send push notification AFTER DB commit for level-up
      if (levelUp) {
        await this.sendLevelUpNotification(userId, catId, newLevel);
        // Requirement 17: grant level rewards for every level crossed.
        await this.levelRewardsService.grantForLevelUp(userId, catId, 0, newLevel);
        // Requirement 18.2: per-cat tier badges crossed by this level-up.
        badgesEarned = await this.detectTierBadges(userId, catId, 0, newLevel);
      }

      return { xpAwarded: xpToAdd, newLevel, levelUp, badgesEarned };
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
    let badgesEarned: EarnedBadge[] | undefined;

    // Send push notification AFTER DB commit for level-up
    if (levelUp) {
      await this.sendLevelUpNotification(userId, catId, newLevel);
      // Requirement 17: grant level rewards for every level crossed.
      await this.levelRewardsService.grantForLevelUp(userId, catId, previousLevel, newLevel);
      // Requirement 18.2: per-cat tier badges crossed by this level-up.
      badgesEarned = await this.detectTierBadges(userId, catId, previousLevel, newLevel);
    }

    return { xpAwarded: xpToAdd, newLevel, levelUp, badgesEarned };
  }

  /**
   * Requirement 18.2: per-cat level badges (bronze/silver/gold/diamond)
   * whose tier level was crossed by this level-up. Sends one badge push per
   * tier crossed (in addition to the level-up push).
   */
  private async detectTierBadges(
    userId: string,
    catId: string,
    fromLevel: number,
    toLevel: number,
  ): Promise<EarnedBadge[] | undefined> {
    const crossed = BADGE_TIERS.filter((t) => fromLevel < t.level && t.level <= toLevel);
    if (crossed.length === 0) {
      return undefined;
    }

    let catName = 'your cat';
    try {
      const cat = await this.prisma.cat.findUnique({ where: { id: catId } });
      catName = cat?.name ?? catName;
    } catch {
      // Name lookup failure — fall back to the generic label.
    }

    const badges = crossed.map(({ level, tier }) => ({
      id: `cat-${tier.toLowerCase()}-${catId}`,
      title: `${tier} Badge — ${catName}`,
      icon: 'ribbon',
      levelRequired: level,
    }));

    for (const badge of badges) {
      try {
        await this.alertsService.notifyMilestone(
          userId,
          'Badge Earned! 🏅',
          `You earned the ${badge.title}!`,
        );
      } catch {
        // Push failure must never fail the XP award.
      }
    }

    return badges.map(({ id, title, icon }) => ({ id, title, icon }));
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
   * Badge catalogue (Requirement 18.6): every available badge with its
   * unlock criteria and the user's current progress toward it.
   */
  async getBadgeCatalogue(userId: string) {
    const [catsDiscovered, donationCount, ownerships] = await Promise.all([
      this.prisma.userCatDiscovery.count({ where: { userId } }),
      this.prisma.donation.count({
        where: { donorId: userId, status: { in: ['escrowed', 'released'] } },
      }),
      this.prisma.ownership.findMany({
        where: { userId },
        select: { level: true },
      }),
    ]);

    const globalEntries = GLOBAL_BADGE_DEFS.map((def) => {
      const progress = def.metric === 'donations' ? donationCount : catsDiscovered;
      return {
        id: def.id,
        title: def.title,
        icon: def.icon,
        type: 'global' as const,
        criteria: def.criteria,
        target: def.target,
        progress: Math.min(progress, def.target),
        earned: progress >= def.target,
      };
    });

    // Per-cat tier badges: progress is the user's highest ownership level;
    // earnedCount says with how many cats the tier has been reached.
    const highestLevel = ownerships.reduce((max, o) => Math.max(max, o.level), 0);
    const tierEntries = BADGE_TIERS.map(({ level, tier }) => {
      const earnedCount = ownerships.filter((o) => o.level >= level).length;
      return {
        id: `tier-${tier.toLowerCase()}`,
        title: `${tier} Badge`,
        icon: 'ribbon',
        type: 'per-cat' as const,
        criteria: `Reach ownership Level ${level} with a cat`,
        target: level,
        progress: Math.min(highestLevel, level),
        earned: earnedCount > 0,
        earnedCount,
      };
    });

    return { badges: [...globalEntries, ...tierEntries] };
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
  /** Which aggregate count unlocks this badge (also drives Req 18.2 detection). */
  metric: 'donations' | 'discoveries';
  /** Count at which the badge unlocks. */
  target: number;
  /** Unlock criteria text for the badge catalogue (Req 18.6). */
  criteria: string;
  earned: (s: { catsDiscovered: number; donationCount: number }) => boolean;
}> = [
  { id: 'first-donation', title: 'First Donation', icon: 'heart', metric: 'donations', target: 1, criteria: 'Donate a food item to any cat', earned: (s) => s.donationCount >= 1 },
  { id: 'donations-100', title: '100 Total Donations', icon: 'heart-circle', metric: 'donations', target: 100, criteria: 'Donate 100 food items in total', earned: (s) => s.donationCount >= 100 },
  { id: 'discovered-10', title: 'Discovered 10 Cats', icon: 'paw', metric: 'discoveries', target: 10, criteria: 'Discover 10 different cats', earned: (s) => s.catsDiscovered >= 10 },
  { id: 'discovered-50', title: 'Discovered 50 Cats', icon: 'paw', metric: 'discoveries', target: 50, criteria: 'Discover 50 different cats', earned: (s) => s.catsDiscovered >= 50 },
];

/** Per-cat level badge tiers (Requirement 17.3/17.5/17.7/17.10, 18.4). */
const BADGE_TIERS: ReadonlyArray<{ level: number; tier: string }> = [
  { level: 3, tier: 'Bronze' },
  { level: 5, tier: 'Silver' },
  { level: 7, tier: 'Gold' },
  { level: 10, tier: 'Diamond' },
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
