import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/** A cart line item as submitted by the client (quantities only — prices are server-side). */
export interface CheckoutCartItem {
  foodItemId: string;
  quantity: number;
}

/** A priced cart line item as stored on the payment intent. */
export interface CheckoutPricedItem {
  foodItemId: string;
  name: string;
  priceCents: number;
  quantity: number;
}

export interface CheckoutIntent {
  userId: string;
  items: CheckoutPricedItem[];
  totalCents: number;
  status: 'pending' | 'paid';
}

/**
 * In-memory store for checkout payment intents (SANDBOX mode).
 * In production, this would be persisted to the database.
 */
const checkoutIntents = new Map<string, CheckoutIntent>();

/**
 * CheckoutService
 * Direct-checkout purchase flow (Requirement 10 — no in-app wallet):
 * the exact cart total is routed to the payment gateway, and the purchased
 * item quantities are credited to the user's inventory only after the
 * gateway confirms payment (webhook).
 * All amounts are in MYR cents (integer).
 */
export class CheckoutService {
  /**
   * Create a checkout payment intent for a cart of food items.
   * Prices and the total are computed server-side from the FoodItem table;
   * client-supplied amounts are never trusted.
   * Throws "Food item not found" if any foodItemId is invalid.
   */
  async createCheckout(
    userId: string,
    cart: CheckoutCartItem[],
  ): Promise<{ intentId: string; paymentUrl: string; totalCents: number; items: CheckoutPricedItem[] }> {
    if (cart.length === 0) {
      throw new Error('No items to purchase');
    }
    if (cart.some((item) => item.quantity < 1)) {
      throw new Error('Quantity must be at least 1');
    }

    // Merge duplicate lines for the same food item
    const quantities = new Map<string, number>();
    for (const item of cart) {
      quantities.set(item.foodItemId, (quantities.get(item.foodItemId) ?? 0) + item.quantity);
    }

    const foodItemIds = [...quantities.keys()];
    const foodItems = await prisma.foodItem.findMany({ where: { id: { in: foodItemIds } } });

    if (foodItems.length !== foodItemIds.length) {
      throw new Error('Food item not found');
    }

    const items: CheckoutPricedItem[] = foodItems.map((foodItem) => ({
      foodItemId: foodItem.id,
      name: foodItem.name,
      priceCents: foodItem.priceCents,
      quantity: quantities.get(foodItem.id)!,
    }));

    const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);

    const intentId = `ci_${crypto.randomUUID()}`;
    checkoutIntents.set(intentId, { userId, items, totalCents, status: 'pending' });

    // SANDBOX payment gateway — the exact total is routed to the gateway
    const paymentUrl = `https://sandbox.payment.example.com/pay/${intentId}?amount=${totalCents}`;

    return { intentId, paymentUrl, totalCents, items };
  }

  /**
   * Fulfil a checkout after the payment gateway confirms payment.
   * Credits the purchased quantities to the user's inventory.
   * Idempotent on intentId: returns false (without touching inventory)
   * if the intent has already been fulfilled.
   */
  async fulfillCheckout(intentId: string): Promise<boolean> {
    const intent = checkoutIntents.get(intentId);

    if (!intent) {
      throw new Error('Payment intent not found');
    }

    if (intent.status === 'paid') {
      return false;
    }

    // Mark as paid before crediting to prevent double-processing
    intent.status = 'paid';
    checkoutIntents.set(intentId, intent);

    await prisma.$transaction(async (tx) => {
      for (const item of intent.items) {
        await tx.userInventory.upsert({
          where: { userId_foodItemId: { userId: intent.userId, foodItemId: item.foodItemId } },
          update: { quantity: { increment: item.quantity } },
          create: { userId: intent.userId, foodItemId: item.foodItemId, quantity: item.quantity },
        });
      }
    });

    return true;
  }

  /**
   * Get a checkout intent by ID (used by the sandbox simulate endpoint and tests).
   */
  getIntent(intentId: string): CheckoutIntent | undefined {
    return checkoutIntents.get(intentId);
  }
}
