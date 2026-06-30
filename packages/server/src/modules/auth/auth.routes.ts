import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../middleware/auth';

const controller = new AuthController();

export const authRoutes = Router();

authRoutes.post('/register', (req, res) => controller.register(req, res));
authRoutes.post('/login', (req, res) => controller.login(req, res));
authRoutes.post('/refresh', (req, res) => controller.refresh(req, res));
authRoutes.post('/logout', (req, res) => controller.logout(req, res));
authRoutes.get('/me', authMiddleware, (req, res) => {
  res.json({ userId: req.user!.userId, email: req.user!.email });
});
