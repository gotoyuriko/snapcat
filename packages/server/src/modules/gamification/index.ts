import { GamificationAction, XPResult } from '@codingkitty/shared';

/**
 * Gamification Module
 * Handles XP awarding, level calculations, ownership promotion, and leaderboard.
 */

export interface GamificationModule {
  /** Record an action and award XP; enforce daily donation cap; evaluate level promotion. */
  recordAction(
    userId: string,
    catId: string,
    action: GamificationAction,
    amountCents?: number,
  ): Promise<XPResult>;
  /** Get the ownership record for a user–cat pair. */
  getOwnership(userId: string, catId: string): Promise<{ level: number; xp: number } | null>;
  /** Calculate user's current level from XP */
  calculateLevel(xp: number): number;
}

export { GamificationService, calculateLevel } from './gamification.service';
export { GamificationController } from './gamification.controller';
export { gamificationRoutes } from './gamification.routes';
