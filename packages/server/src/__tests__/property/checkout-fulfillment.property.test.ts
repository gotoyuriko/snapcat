/**
 * Property 4 (reworked): Direct-checkout correctness
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 *
 * The app has no in-app wallet: a checkout routes the exact cart total to the
 * payment gateway, and inventory is credited only when the gateway confirms
 * payment. Two invariants for any cart:
 *
 *   1. Exact-amount invariant — the payment intent total equals the sum of
 *      server-side item prices × quantities (client amounts are never used).
 *   2. Fulfilment idempotence — no matter how many times the payment webhook
 *      fires for the same intent, each purchased quantity is credited to the
 *      user's inventory exactly once.
 *
 * We test the actual CheckoutService with mocked Prisma, simulating database
 * behaviour in memory.
 */

import * as fc from 'fast-check';

// --- In-memory state ---
let foodItemPrices: Map<string, number>;
let inventoryMap: Map<string, number>;

// --- Mock PrismaClient ---
const mockPrismaInstance: any = {
  foodItem: {
    findMany: jest.fn(),
  },
  userInventory: {
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaInstance),
}));

// Import after mocks
import { CheckoutService } from '../../modules/donation/checkout.service';

function setupMocks(userId: string) {
  mockPrismaInstance.foodItem.findMany.mockImplementation((args: any) => {
    const ids: string[] = args?.where?.id?.in ?? [];
    return Promise.resolve(
      ids
        .filter((id) => foodItemPrices.has(id))
        .map((id) => ({ id, name: `Food-${id}`, priceCents: foodItemPrices.get(id)! })),
    );
  });

  mockPrismaInstance.userInventory.upsert.mockImplementation((args: any) => {
    const foodItemId = args?.where?.userId_foodItemId?.foodItemId;
    const qty = args?.update?.quantity?.increment ?? args?.create?.quantity ?? 0;
    inventoryMap.set(foodItemId, (inventoryMap.get(foodItemId) ?? 0) + qty);
    return Promise.resolve({ userId, foodItemId, quantity: inventoryMap.get(foodItemId) });
  });

  // $transaction(callback) — run the callback against the same mock instance
  mockPrismaInstance.$transaction.mockImplementation((callback: any) =>
    callback(mockPrismaInstance),
  );
}

// --- Arbitraries ---

const cartLineArb = fc.record({
  itemIndex: fc.integer({ min: 0, max: 4 }),
  priceCents: fc.integer({ min: 50, max: 5000 }),
  quantity: fc.integer({ min: 1, max: 20 }),
});

describe('Direct Checkout — Property Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('intent total equals Σ price×qty and webhook fulfilment credits inventory exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Cart of 1–10 lines (duplicate items allowed — service must merge them)
        fc.array(cartLineArb, { minLength: 1, maxLength: 10 }),
        // How many times the payment webhook fires (≥1, duplicates possible)
        fc.integer({ min: 1, max: 5 }),
        async (cartLines, webhookDeliveries) => {
          const userId = 'test-user-001';

          // Reset in-memory state; register prices per distinct item index
          foodItemPrices = new Map();
          inventoryMap = new Map();
          for (const line of cartLines) {
            const id = `food-item-${line.itemIndex}`;
            if (!foodItemPrices.has(id)) {
              foodItemPrices.set(id, line.priceCents);
            }
          }

          setupMocks(userId);
          const service = new CheckoutService();

          const cart = cartLines.map((line) => ({
            foodItemId: `food-item-${line.itemIndex}`,
            quantity: line.quantity,
          }));

          const { intentId, totalCents, items } = await service.createCheckout(userId, cart);

          // INVARIANT 1: exact amount — total is derived from server-side
          // prices and the merged quantities of the submitted cart
          const expectedQuantities = new Map<string, number>();
          for (const line of cart) {
            expectedQuantities.set(
              line.foodItemId,
              (expectedQuantities.get(line.foodItemId) ?? 0) + line.quantity,
            );
          }
          const expectedTotal = [...expectedQuantities.entries()].reduce(
            (sum, [id, qty]) => sum + foodItemPrices.get(id)! * qty,
            0,
          );
          expect(totalCents).toBe(expectedTotal);
          expect(items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)).toBe(expectedTotal);

          // Inventory must be untouched before payment confirmation
          expect(inventoryMap.size).toBe(0);

          // Fire the webhook N times (duplicate deliveries)
          let fulfilledCount = 0;
          for (let i = 0; i < webhookDeliveries; i++) {
            const fulfilled = await service.fulfillCheckout(intentId);
            if (fulfilled) fulfilledCount++;
          }

          // INVARIANT 2: exactly one delivery fulfils; inventory is credited once
          expect(fulfilledCount).toBe(1);
          for (const [id, qty] of expectedQuantities) {
            expect(inventoryMap.get(id)).toBe(qty);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
