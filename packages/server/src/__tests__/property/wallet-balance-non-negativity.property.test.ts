/**
 * Property 4: Wallet balance non-negativity
 *
 * **Validates: Requirements 10.3, 10.4, 10.5**
 *
 * For any sequence of purchase and donation operations on a user's wallet,
 * the walletBalance never goes below zero. The wallet system uses integer MYR cents.
 *
 * The key invariant is that WalletService.debit rejects any operation that would
 * cause the balance to go negative, and credits always increase the balance.
 *
 * We test the actual WalletService and FoodItemService classes with mocked Prisma,
 * simulating database behavior in memory to validate the non-negativity property.
 */

import * as fc from 'fast-check';

// --- In-memory state ---
let walletBalance: number;
let foodItemPrices: Map<string, number>;
let inventoryMap: Map<string, number>;

// --- Mock PrismaClient ---
// We need to intercept the tagged template literal for $executeRaw.
// Prisma's $executeRaw`...` is a tagged template that receives (TemplateStringsArray, ...values).
// Our mock function acts as the tag function.
const mockPrismaInstance = {
  $executeRaw: jest.fn(),
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  foodItem: {
    findUnique: jest.fn(),
  },
  userInventory: {
    upsert: jest.fn(),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaInstance),
}));

// Import after mocks
import { WalletService } from '../../modules/donation/wallet.service';
import { FoodItemService } from '../../modules/donation/food-item.service';

// --- Operation types ---
type Operation =
  | { type: 'credit'; amountCents: number }
  | { type: 'purchase'; foodItemId: string; priceCents: number; quantity: number };

// --- Setup mock behaviors ---
function setupMocks(userId: string) {
  // $executeRaw is used as a tagged template literal: prisma.$executeRaw`...${val1}...${val2}...${val3}`
  // As a tag function it receives: (strings: TemplateStringsArray, amountCents, usrId, amountCents)
  mockPrismaInstance.$executeRaw.mockImplementation(
    (strings: TemplateStringsArray, ...values: any[]) => {
      // values[0] = amountCents (first interpolation in the debit query)
      const amountCents: number = values[0];

      if (walletBalance >= amountCents) {
        walletBalance -= amountCents;
        return 1; // 1 row affected
      }
      return 0; // 0 rows affected
    },
  );

  // user.update for credit (increment walletBalance)
  mockPrismaInstance.user.update.mockImplementation((args: any) => {
    const increment = args?.data?.walletBalance?.increment;
    if (typeof increment === 'number') {
      walletBalance += increment;
    }
    return Promise.resolve({ id: userId, walletBalance });
  });

  // user.findUnique for getBalance
  mockPrismaInstance.user.findUnique.mockImplementation(() => {
    return Promise.resolve({ id: userId, walletBalance });
  });

  // foodItem.findUnique: return food item based on our price map
  mockPrismaInstance.foodItem.findUnique.mockImplementation((args: any) => {
    const id = args?.where?.id;
    if (id && foodItemPrices.has(id)) {
      return Promise.resolve({ id, name: `Food-${id}`, priceCents: foodItemPrices.get(id)! });
    }
    return Promise.resolve(null);
  });

  // userInventory.upsert: track inventory in memory
  mockPrismaInstance.userInventory.upsert.mockImplementation((args: any) => {
    const foodItemId = args?.where?.userId_foodItemId?.foodItemId;
    const qty = args?.update?.quantity?.increment ?? args?.create?.quantity ?? 0;
    const current = inventoryMap.get(foodItemId) || 0;
    inventoryMap.set(foodItemId, current + qty);
    return Promise.resolve({
      userId,
      foodItemId,
      quantity: inventoryMap.get(foodItemId),
      foodItem: { id: foodItemId, name: `Food-${foodItemId}`, priceCents: foodItemPrices.get(foodItemId) || 0 },
    });
  });
}

// --- Arbitraries ---

const creditArb: fc.Arbitrary<Operation> = fc.integer({ min: 1, max: 100_000 }).map((amountCents) => ({
  type: 'credit' as const,
  amountCents,
}));

const purchaseArb: fc.Arbitrary<Operation> = fc.record({
  priceCents: fc.integer({ min: 50, max: 5000 }),
  quantity: fc.integer({ min: 1, max: 10 }),
}).map(({ priceCents, quantity }) => ({
  type: 'purchase' as const,
  foodItemId: '', // Will be assigned unique ID during execution
  priceCents,
  quantity,
}));

const operationArb: fc.Arbitrary<Operation> = fc.oneof(creditArb, purchaseArb);

// --- Property Test ---

describe('Wallet Balance Non-Negativity — Property Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 4: Wallet balance non-negativity
   *
   * **Validates: Requirements 10.3, 10.4, 10.5**
   *
   * For any initial balance and any sequence of credit/purchase operations,
   * the wallet balance NEVER goes below zero. Purchases that would exceed
   * the balance are rejected and leave the balance unchanged.
   */
  it('wallet balance never goes below zero for any sequence of credits and purchases', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Initial wallet balance: 0 to 500_000 cents (up to RM5000)
        fc.integer({ min: 0, max: 500_000 }),
        // Sequence of 1 to 20 operations
        fc.array(operationArb, { minLength: 1, maxLength: 20 }),
        async (initialBalance, operations) => {
          const userId = 'test-user-001';

          // Reset in-memory state
          walletBalance = initialBalance;
          inventoryMap = new Map();
          foodItemPrices = new Map();

          // Assign unique food item IDs and register prices
          let purchaseIdx = 0;
          for (const op of operations) {
            if (op.type === 'purchase') {
              op.foodItemId = `food-item-${purchaseIdx++}`;
              foodItemPrices.set(op.foodItemId, op.priceCents);
            }
          }

          // Setup mocks
          setupMocks(userId);

          const walletService = new WalletService();
          const foodItemService = new FoodItemService(walletService);

          // Execute each operation and verify the invariant
          for (const op of operations) {
            const balanceBefore = walletBalance;

            if (op.type === 'credit') {
              await walletService.credit(userId, op.amountCents, 'top-up');
            } else {
              const totalCost = op.priceCents * op.quantity;
              let threw = false;

              try {
                await foodItemService.purchase(userId, op.foodItemId, op.quantity);
              } catch (error: any) {
                threw = true;
                // Only expected error is insufficient balance
                expect(error.message).toBe('Insufficient wallet balance');
                // Balance should be unchanged after failure
                expect(walletBalance).toBe(balanceBefore);
              }

              if (!threw) {
                // Successful purchase should have debited exactly totalCost
                expect(walletBalance).toBe(balanceBefore - totalCost);
              }
            }

            // INVARIANT: wallet balance must NEVER be negative
            expect(walletBalance).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
