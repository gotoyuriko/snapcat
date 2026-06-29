import { Request, Response } from 'express';
import { LeaderboardService } from './leaderboard.service';

export class LeaderboardController {
  private leaderboardService: LeaderboardService;

  constructor(leaderboardService?: LeaderboardService) {
    this.leaderboardService = leaderboardService ?? new LeaderboardService();
  }

  /**
   * GET /cats/:catId/leaderboard
   *
   * Returns Owner entries for the cat ranked by cumulative per-cat XP.
   * Gated: requester must have a UserCatDiscovery record for the cat (Lvl0+).
   *
   * Query params:
   *   - limit (optional, default 20): max number of entries to return
   *
   * Response:
   *   200: { entries: LeaderboardEntry[], message?: string }
   *   403: { error: "Access denied..." }
   *   400: { error: "..." }
   */
  async getLeaderboard(req: Request, res: Response): Promise<void> {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { catId } = req.params;
    if (!catId) {
      res.status(400).json({ error: 'catId is required' });
      return;
    }

    // Parse limit query param
    const limitParam = req.query.limit;
    let limit = 20;
    if (limitParam) {
      const parsed = parseInt(limitParam as string, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100); // Cap at 100
      }
    }

    try {
      // Gate: requester must have a UserCatDiscovery record for the cat (Lvl0+)
      const hasDiscovery = await this.leaderboardService.hasDiscovery(userId, catId);
      if (!hasDiscovery) {
        res.status(403).json({
          error: 'Access denied: you must have discovered this cat to view its leaderboard',
        });
        return;
      }

      const result = await this.leaderboardService.getCatLeaderboard(catId, limit);

      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
