import { Router } from 'express';
import { GamificationController } from './gamification.controller';
import { authMiddleware } from '../../middleware/auth';

const controller = new GamificationController();

export const gamificationRoutes = Router();

// GET /gamification/leaderboard — top users ranked by total XP.
gamificationRoutes.get('/leaderboard', authMiddleware, (req, res) =>
  controller.getLeaderboard(req, res),
);

// GET /gamification/stats — authenticated user's XP, rank, and level for their profile.
gamificationRoutes.get('/stats', authMiddleware, (req, res) => controller.getUserStats(req, res));

// GET /gamification/badges — authenticated user's earned badges (profile showcase).
gamificationRoutes.get('/badges', authMiddleware, (req, res) =>
  controller.getUserBadges(req, res),
);

// GET /gamification/level-rewards — per-level rewards table (Req 17.11).
gamificationRoutes.get('/level-rewards', authMiddleware, (req, res) =>
  controller.getLevelRewards(req, res),
);
