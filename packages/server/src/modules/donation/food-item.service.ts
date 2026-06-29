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
}
