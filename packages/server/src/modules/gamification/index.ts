import { GamificationAction, XPResult, LeaderboardEntry } from '@codingkitty/shared';

/**
 * Gamification Module
 * Handles XP awarding, level calculations, and leaderboard.
 */

export interface GamificationModule {
  /** Award XP for a completed action */
  awardXP(userId: string, action: GamificationAction): Promise<XPResult>;
  /** Get the global leaderboard */
  getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
  /** Calculate user's current level from XP */
  calculateLevel(xp: number): number;
}

export { GamificationService } from './gamification.service';
export { GamificationController } from './gamification.controller';
export { gamificationRoutes } from './gamification.routes';
