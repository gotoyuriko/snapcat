import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * FoodItemService
 * Manages the food item catalogue and user inventory.
 * Purchases go through the direct-checkout flow (CheckoutService) —
 * inventory is credited only after the payment gateway confirms payment.
 */
export class FoodItemService {
  /**
   * Get all food items available for purchase.
   */
  async getAll() {
    return prisma.foodItem.findMany({
      orderBy: { priceCents: 'asc' },
    });
  }

  /**
   * Get user inventory with food item details and total credit value.
   */
  async getUserInventory(userId: string) {
    const inventory = await prisma.userInventory.findMany({
      where: { userId },
      include: { foodItem: true },
    });

    const totalCreditCents = inventory.reduce(
      (sum, item) => sum + item.quantity * item.foodItem.priceCents,
      0,
    );

    return { inventory, totalCreditCents };
  }
}
