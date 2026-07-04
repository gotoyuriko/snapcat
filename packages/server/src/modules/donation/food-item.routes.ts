import { Router } from 'express';
import { FoodItemController } from './food-item.controller';
import { authMiddleware } from '../../middleware/auth';
import { financialSecurityMiddleware } from '../../middleware/financialSecurity';

const controller = new FoodItemController();

export const foodItemRoutes = Router();

// Apply financial security middleware to food item routes
// (rate limiting, input sanitization, security headers)
foodItemRoutes.use(financialSecurityMiddleware);

// All endpoints require authentication
foodItemRoutes.get('/', authMiddleware, (req, res) => controller.getAll(req, res));
foodItemRoutes.post('/purchase', authMiddleware, (req, res) => controller.purchase(req, res));
