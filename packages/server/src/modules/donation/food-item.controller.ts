import { Request, Response } from 'express';
import { z } from 'zod';
import { FoodItemService } from './food-item.service';

/** Zod schema for purchase request validation */
const purchaseSchema = z.object({
  foodItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
});

/**
 * FoodItemController
 * Handles food item catalogue and purchase endpoints.
 */
export class FoodItemController {
  private foodItemService: FoodItemService;

  constructor(foodItemService?: FoodItemService) {
    this.foodItemService = foodItemService ?? new FoodItemService();
  }

  /**
   * GET /food-items
   * Returns all available food items and the authenticated user's inventory.
   */
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const foodItems = await this.foodItemService.getAll();
      const { inventory, totalCreditCents } = await this.foodItemService.getUserInventory(userId);

      res.status(200).json({ foodItems, inventory, totalCreditCents });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }

  /**
   * POST /food-items/purchase
   * Purchases food items, debits wallet, and increments user inventory.
   */
  async purchase(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate request body
      const parsed = purchaseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
        return;
      }

      const { foodItemId, quantity } = parsed.data;

      const inventoryRecord = await this.foodItemService.purchase(userId, foodItemId, quantity);

      res.status(200).json({
        message: 'Purchase successful',
        inventory: inventoryRecord,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';

      if (message === 'Insufficient wallet balance') {
        res.status(400).json({ error: message });
        return;
      }

      if (message === 'Food item not found') {
        res.status(404).json({ error: message });
        return;
      }

      res.status(500).json({ error: message });
    }
  }
}
