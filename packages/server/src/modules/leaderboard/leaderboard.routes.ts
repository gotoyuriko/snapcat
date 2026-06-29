import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { LeaderboardController } from './leaderboard.controller';

/**
 * Leaderboard Routes — GET /cats/:catId/leaderboard
 * Task 16.6: Per-cat owner leaderboard ranked by cumulative XP.
 *
 * Gated by authentication + UserCatDiscovery record check (Lvl0+).
 * Requirements: 14.5, 14.6
 */

const controller = new LeaderboardController();

export const leaderboardRoutes = Router();

// GET /api/cats/:catId/leaderboard — Get per-cat owner leaderboard
leaderboardRoutes.get(
  '/:catId/leaderboard',
  authMiddleware,
  (req, res) => controller.getLeaderboard(req, res),
);
