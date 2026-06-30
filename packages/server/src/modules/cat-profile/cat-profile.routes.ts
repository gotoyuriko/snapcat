import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { CatProfileController } from './cat-profile.controller';

const controller = new CatProfileController();

export const catProfileRoutes = Router();

// GET /api/cats/:catId — full profile for a single cat (auth required).
// Mounted alongside chat (/:catId/messages) and leaderboard (/:catId/leaderboard)
// at /api/cats; ":catId" only matches the single-segment path so there's no clash.
catProfileRoutes.get('/:catId', authMiddleware, (req, res) => controller.getProfile(req, res));
