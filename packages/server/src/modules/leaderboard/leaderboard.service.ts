import { PrismaClient } from '@prisma/client';

export interface CatLeaderboardEntry {
  userId: string;
  displayName: string;
  level: number;
  xp: number;
  rank: number;
}

export interface CatLeaderboardResult {
  entries: CatLeaderboardEntry[];
  message?: string;
}

export class LeaderboardService {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  /**
   * Check if the requester has a UserCatDiscovery record for the cat (Lvl0+ access gate).
   */
  async hasDiscovery(userId: string, catId: string): Promise<boolean> {
    const discovery = await this.prisma.userCatDiscovery.findUnique({
      where: { userId_catId: { userId, catId } },
    });
    return discovery !== null;
  }

  /**
   * Returns Owner entries for the cat ranked by cumulative per-cat XP.
   * Only includes Lvl1+ owners who still have a UserCatDiscovery record (not reverted to UNDISCOVERED).
   *
   * Requirements 14.5, 14.6:
   * - Ranked by cumulative per-cat XP
   * - Display name, level, XP, and rank
   * - Remove Owners who lost discovery status
   * - "No owners yet" when empty
   */
  async getCatLeaderboard(catId: string, limit: number = 20): Promise<CatLeaderboardResult> {
    // Query Ownership records where:
    // - catId matches
    // - level >= 1 (Lvl1+ owners only)
    // The FK constraint Ownership→UserCatDiscovery ensures that owners who lost
    // discovery status (UserCatDiscovery deleted) cannot have an Ownership record.
    // This satisfies Req 14.6: "remove Owners who lost discovery status".
    // Join with User to get displayName.
    const ownerships = await this.prisma.ownership.findMany({
      where: {
        catId,
        level: { gte: 1 },
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        xp: 'desc',
      },
      take: limit,
    });

    if (ownerships.length === 0) {
      return {
        entries: [],
        message: 'No owners yet',
      };
    }

    const entries: CatLeaderboardEntry[] = ownerships.map((ownership, index) => ({
      userId: ownership.userId,
      displayName: ownership.user.displayName,
      level: ownership.level,
      xp: ownership.xp,
      rank: index + 1,
    }));

    return { entries };
  }
}
