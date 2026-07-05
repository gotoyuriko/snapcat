/**
 * Coupon redemption at checkout (Requirement 17.2, 17.8, 17.12).
 *
 * - A valid coupon discounts the payment-intent total.
 * - Ownership, single-use, expiry, and minimum-purchase rules are enforced
 *   at intent creation.
 * - The coupon is consumed atomically with fulfillment, and repeat
 *   fulfillment (idempotent webhook) cannot consume it twice.
 */

// --- Mock PrismaClient (module-level, matches checkout.service's own client) ---
const mockPrismaInstance: any = {
  foodItem: {
    findMany: jest.fn(),
  },
  userInventory: {
    upsert: jest.fn().mockResolvedValue({}),
  },
  coupon: {
    findUnique: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  $transaction: jest.fn(async (callback: any) => callback(mockPrismaInstance)),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrismaInstance),
}));

import { CheckoutService } from '../checkout.service';

const KIBBLE = { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Cat Kibble', priceCents: 100 };
const TUNA = { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Tuna Can', priceCents: 1000 };

const VALID_COUPON = {
  id: 'coupon-1',
  userId: 'user-1',
  amountOffCents: 300,
  minPurchaseCents: 1000,
  expiresAt: new Date(Date.now() + 86400000),
  usedAt: null,
};

describe('CheckoutService coupon redemption (Req 17.12)', () => {
  let service: CheckoutService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrismaInstance.$transaction.mockImplementation(async (cb: any) => cb(mockPrismaInstance));
    mockPrismaInstance.coupon.updateMany.mockResolvedValue({ count: 1 });
    service = new CheckoutService();
  });

  it('applies a valid coupon: total = gross − discount', async () => {
    mockPrismaInstance.foodItem.findMany.mockResolvedValue([TUNA]);
    mockPrismaInstance.coupon.findUnique.mockResolvedValue({ ...VALID_COUPON });

    const result = await service.createCheckout(
      'user-1',
      [{ foodItemId: TUNA.id, quantity: 1 }],
      'coupon-1',
    );

    expect(result.discountCents).toBe(300);
    expect(result.totalCents).toBe(700);
  });

  it('rejects a coupon belonging to another user', async () => {
    mockPrismaInstance.foodItem.findMany.mockResolvedValue([TUNA]);
    mockPrismaInstance.coupon.findUnique.mockResolvedValue({
      ...VALID_COUPON,
      userId: 'someone-else',
    });

    await expect(
      service.createCheckout('user-1', [{ foodItemId: TUNA.id, quantity: 1 }], 'coupon-1'),
    ).rejects.toThrow('Coupon not found');
  });

  it('rejects an already-used coupon (single-use)', async () => {
    mockPrismaInstance.foodItem.findMany.mockResolvedValue([TUNA]);
    mockPrismaInstance.coupon.findUnique.mockResolvedValue({
      ...VALID_COUPON,
      usedAt: new Date(),
    });

    await expect(
      service.createCheckout('user-1', [{ foodItemId: TUNA.id, quantity: 1 }], 'coupon-1'),
    ).rejects.toThrow('Coupon already used');
  });

  it('rejects an expired coupon (30-day expiry)', async () => {
    mockPrismaInstance.foodItem.findMany.mockResolvedValue([TUNA]);
    mockPrismaInstance.coupon.findUnique.mockResolvedValue({
      ...VALID_COUPON,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.createCheckout('user-1', [{ foodItemId: TUNA.id, quantity: 1 }], 'coupon-1'),
    ).rejects.toThrow('Coupon expired');
  });

  it('rejects a cart below the coupon minimum purchase', async () => {
    mockPrismaInstance.foodItem.findMany.mockResolvedValue([KIBBLE]);
    mockPrismaInstance.coupon.findUnique.mockResolvedValue({ ...VALID_COUPON });

    // RM1 kibble × 5 = RM5 < RM10 minimum
    await expect(
      service.createCheckout('user-1', [{ foodItemId: KIBBLE.id, quantity: 5 }], 'coupon-1'),
    ).rejects.toThrow('minimum purchase');
  });

  it('a checkout without a coupon has zero discount and never queries coupons', async () => {
    mockPrismaInstance.foodItem.findMany.mockResolvedValue([TUNA]);

    const result = await service.createCheckout('user-1', [
      { foodItemId: TUNA.id, quantity: 1 },
    ]);

    expect(result.discountCents).toBe(0);
    expect(result.totalCents).toBe(1000);
    expect(mockPrismaInstance.coupon.findUnique).not.toHaveBeenCalled();
  });

  it('fulfillment consumes the coupon atomically with the inventory credit', async () => {
    mockPrismaInstance.foodItem.findMany.mockResolvedValue([TUNA]);
    mockPrismaInstance.coupon.findUnique.mockResolvedValue({ ...VALID_COUPON });

    const { intentId } = await service.createCheckout(
      'user-1',
      [{ foodItemId: TUNA.id, quantity: 1 }],
      'coupon-1',
    );
    const fulfilled = await service.fulfillCheckout(intentId);

    expect(fulfilled).toBe(true);
    expect(mockPrismaInstance.coupon.updateMany).toHaveBeenCalledWith({
      where: { id: 'coupon-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('repeat fulfillment (idempotent webhook) does not touch the coupon again', async () => {
    mockPrismaInstance.foodItem.findMany.mockResolvedValue([TUNA]);
    mockPrismaInstance.coupon.findUnique.mockResolvedValue({ ...VALID_COUPON });

    const { intentId } = await service.createCheckout(
      'user-1',
      [{ foodItemId: TUNA.id, quantity: 1 }],
      'coupon-1',
    );
    await service.fulfillCheckout(intentId);
    const second = await service.fulfillCheckout(intentId);

    expect(second).toBe(false);
    expect(mockPrismaInstance.coupon.updateMany).toHaveBeenCalledTimes(1);
  });
});
