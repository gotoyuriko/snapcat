import { Router } from 'express';
import { FoodItemController } from './food-item.controller';
import { authMiddleware } from '../../middleware/auth';

const controller = new FoodItemController();

export const foodItemRoutes = Router();

// All endpoints require authentication
foodItemRoutes.get('/', authMiddleware, (req, res) => controller.getAll(req, res));
foodItemRoutes.post('/purchase', authMiddleware, (req, res) => controller.purchase(req, res));
