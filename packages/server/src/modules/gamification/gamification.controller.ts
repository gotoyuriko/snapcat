import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GamificationService, LEVEL_REWARDS } from './gamification.service';

const prisma = new PrismaClient();

/**
 * GamificationController
 * Global XP/level stats and leaderboard — powers the client Profile screen.
 */
export class GamificationController {
  private gamificationService: GamificationService;

  constructor(gamificationService?: GamificationService) {
    this.gamificationService = gamificationService ?? new GamificationService(prisma);
  }

  /**
   * GET /gamification/stats
   * Returns the authenticated user's global XP, rank, and cat counts.
   */
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const stats = await this.gamificationService.getUserStats(userId);
      res.status(200).json(stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';

      if (message === 'User not found') {
        res.status(404).json({ error: message });
        return;
      }

      res.status(500).json({ error: message });
    }
  }

  /**
   * GET /gamification/level-rewards
   * The full per-level rewards table (Requirement 17.11) for the Level
   * Rewards page — thresholds, item grants, and perk descriptions.
   */
  async getLevelRewards(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ rewards: LEVEL_REWARDS });
  }

  /**
   * GET /gamification/badges
   * Returns the authenticated user's earned badges for the profile showcase.
   */
  async getUserBadges(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await this.gamificationService.getUserBadges(userId);
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }

  /**
   * GET /gamification/leaderboard
   * Returns the top users ranked by total XP.
   */
  async getLeaderboard(req: Request, res: Response): Promise<void> {
    try {
      const limitParam = parseInt(String(req.query.limit ?? '20'), 10);
      const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

      const leaderboard = await this.gamificationService.getLeaderboard(limit);
      res.status(200).json({ entries: leaderboard });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }
}
