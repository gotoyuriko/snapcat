import { PrismaClient } from '@prisma/client';
import { WalletService } from './wallet.service';

const prisma = new PrismaClient();

/**
 * FoodItemService
 * Manages the food item catalogue and purchase flow.
 * Purchase atomically debits the wallet and upserts user inventory.
 */
export class FoodItemService {
  private walletService: WalletService;

  constructor(walletService?: WalletService) {
    this.walletService = walletService ?? new WalletService();
  }

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

  /**
   * Purchase food items: validates item, debits wallet, upserts inventory.
   * Throws "Food item not found" if foodItemId is invalid.
   * Throws "Insufficient wallet balance" (from WalletService) if balance < total cost.
   * Throws "Quantity must be at least 1" if quantity is < 1.
   */
  async purchase(userId: string, foodItemId: string, quantity: number) {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1');
    }

    // Validate food item exists
    const foodItem = await prisma.foodItem.findUnique({
      where: { id: foodItemId },
    });

    if (!foodItem) {
      throw new Error('Food item not found');
    }

    const totalCost = foodItem.priceCents * quantity;

    // Debit wallet (throws "Insufficient wallet balance" if balance < totalCost)
    await this.walletService.debit(userId, totalCost, `purchase:${foodItem.name}x${quantity}`);

    // Upsert user inventory — increment quantity if exists, create if not
    const inventoryRecord = await prisma.userInventory.upsert({
      where: {
        userId_foodItemId: { userId, foodItemId },
      },
      update: {
        quantity: { increment: quantity },
      },
      create: {
        userId,
        foodItemId,
        quantity,
      },
      include: { foodItem: true },
    });

    return inventoryRecord;
  }

  /**
   * Purchase a cart of food items in one atomic transaction: validates every
   * item, debits the wallet once for the combined total, and upserts
   * inventory for each item. Throws "Food item not found" if any
   * foodItemId is invalid, or "Insufficient wallet balance" if the combined
   * total exceeds the wallet balance (no items are purchased in that case).
   */
  async purchaseMultiple(
    userId: string,
    items: { foodItemId: string; quantity: number }[],
  ) {
    if (items.length === 0) {
      throw new Error('No items to purchase');
    }
    if (items.some((item) => item.quantity < 1)) {
      throw new Error('Quantity must be at least 1');
    }

    return prisma.$transaction(async (tx) => {
      const foodItemIds = [...new Set(items.map((item) => item.foodItemId))];
      const foodItems = await tx.foodItem.findMany({ where: { id: { in: foodItemIds } } });

      if (foodItems.length !== foodItemIds.length) {
        throw new Error('Food item not found');
      }

      const priceById = new Map(foodItems.map((item) => [item.id, item.priceCents]));
      const totalCostCents = items.reduce(
        (sum, item) => sum + (priceById.get(item.foodItemId) ?? 0) * item.quantity,
        0,
      );

      // Atomically debit wallet, rejecting if balance would go negative; returns the post-debit balance
      const debited = await tx.$queryRaw<{ walletBalance: number }[]>`
        UPDATE "User"
        SET "walletBalance" = "walletBalance" - ${totalCostCents}
        WHERE "id" = ${userId} AND "walletBalance" >= ${totalCostCents}
        RETURNING "walletBalance"
      `;

      if (debited.length === 0) {
        throw new Error('Insufficient wallet balance');
      }

      const inventory = [];
      for (const item of items) {
        const record = await tx.userInventory.upsert({
          where: { userId_foodItemId: { userId, foodItemId: item.foodItemId } },
          update: { quantity: { increment: item.quantity } },
          create: { userId, foodItemId: item.foodItemId, quantity: item.quantity },
          include: { foodItem: true },
        });
        inventory.push(record);
      }

      return { inventory, newBalanceCents: debited[0].walletBalance };
    });
  }
}
