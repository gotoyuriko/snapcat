import { Request, Response } from 'express';

/**
 * TODO: Implement GamificationController
 * - Get leaderboard
 * - Get user's XP and level
 */

export class GamificationController {
  async getLeaderboard(_req: Request, res: Response): Promise<void> {
    // TODO: Call service, return leaderboard
    res.status(501).json({ error: 'Not implemented' });
  }

  async getUserStats(_req: Request, res: Response): Promise<void> {
    // TODO: Get XP, level, rank for authenticated user
    res.status(501).json({ error: 'Not implemented' });
  }
}
