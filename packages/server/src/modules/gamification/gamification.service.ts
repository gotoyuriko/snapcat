import { GamificationAction, XPResult, LeaderboardEntry } from '@codingkitty/shared';

/**
 * TODO: Implement GamificationService
 * - Define XP values per action type
 * - Calculate level thresholds
 * - Award XP and handle level-up events
 * - Query leaderboard from database
 */

const XP_VALUES: Record<GamificationAction, number> = {
  first_discovery: 100,
  sighting_report: 20,
  donation: 30,
  medical_request: 50,
  chat_message: 5,
  daily_login: 10,
  streak_bonus: 25,
};

export class GamificationService {
  async awardXP(_userId: string, action: GamificationAction): Promise<XPResult> {
    // TODO: Get user, add XP, check level-up, persist
    const xpAwarded = XP_VALUES[action];
    throw new Error('Not implemented');
  }

  async getLeaderboard(_limit: number = 50): Promise<LeaderboardEntry[]> {
    // TODO: Query top users by XP
    throw new Error('Not implemented');
  }

  calculateLevel(xp: number): number {
    // Each level requires 100 * level XP (quadratic growth)
    let level = 1;
    let threshold = 100;
    while (xp >= threshold) {
      level++;
      threshold += 100 * level;
    }
    return level;
  }
}
