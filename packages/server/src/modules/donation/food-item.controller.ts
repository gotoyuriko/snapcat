import { Request, Response } from 'express';
import { FoodItemService } from './food-item.service';

/**
 * FoodItemController
 * Handles the food item catalogue and user inventory endpoint.
 * Purchasing is handled by the direct-checkout flow (CheckoutController).
 */
export class FoodItemController {
  private foodItemService: FoodItemService;

  constructor(foodItemService?: FoodItemService) {
    this.foodItemService = foodItemService ?? new FoodItemService();
  }

  /**
   * GET /food-items
   * Returns all available food items and the authenticated user's inventory,
   * including the total credit value of the inventory (Requirement 10.4).
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

      res.status(200).json({
        foodItems: foodItems.map((item) => ({
          id: item.id,
          name: item.name,
          priceMyr: item.priceCents / 100,
          description: item.description ?? undefined,
        })),
        inventory: inventory.map((entry) => ({
          foodItemId: entry.foodItemId,
          name: entry.foodItem.name,
          priceMyr: entry.foodItem.priceCents / 100,
          quantity: entry.quantity,
        })),
        totalCreditMyr: totalCreditCents / 100,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }
}
