import { Request, Response } from 'express';
import { FoodItemController } from '../../modules/donation/food-item.controller';

// Mock FoodItemService
const mockGetAll = jest.fn();
const mockGetUserInventory = jest.fn();
const mockPurchase = jest.fn();

jest.mock('../../modules/donation/food-item.service', () => {
  return {
    FoodItemService: jest.fn().mockImplementation(() => ({
      getAll: mockGetAll,
      getUserInventory: mockGetUserInventory,
      purchase: mockPurchase,
    })),
  };
});

function createMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: { userId: 'user-1', email: 'test@example.com' },
    body: {},
    ...overrides,
  };
}

function createMockRes(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = { statusCode: 0, body: null };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((data: any) => { res.body = data; return res; });
  return res;
}

describe('FoodItemController', () => {
  let controller: FoodItemController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FoodItemController();
  });

  describe('GET /food-items (getAll)', () => {
    it('returns 401 if user is not authenticated', async () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      await controller.getAll(req as Request, res as Response);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 200 with client-shaped food items and inventory (MYR, flattened)', async () => {
      const mockFoodItems = [
        { id: 'item-1', name: 'Cat Kibble', priceCents: 100, description: 'Basic kibble', imageUrl: null },
        { id: 'item-2', name: 'Cat Snack', priceCents: 500, description: 'Tasty snack', imageUrl: null },
      ];
      const mockInventory = {
        inventory: [
          { userId: 'user-1', foodItemId: 'item-1', quantity: 3, foodItem: mockFoodItems[0] },
        ],
        totalCreditCents: 300,
      };

      mockGetAll.mockResolvedValue(mockFoodItems);
      mockGetUserInventory.mockResolvedValue(mockInventory);

      const req = createMockReq();
      const res = createMockRes();

      await controller.getAll(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.foodItems).toEqual([
        { id: 'item-1', name: 'Cat Kibble', priceMyr: 1, description: 'Basic kibble' },
        { id: 'item-2', name: 'Cat Snack', priceMyr: 5, description: 'Tasty snack' },
      ]);
      expect(res.body.inventory).toEqual([
        { foodItemId: 'item-1', name: 'Cat Kibble', priceMyr: 1, quantity: 3 },
      ]);
      expect(res.body.totalCreditMyr).toBe(3);
    });

    it('returns 500 if service throws an error', async () => {
      mockGetAll.mockRejectedValue(new Error('DB error'));

      const req = createMockReq();
      const res = createMockRes();

      await controller.getAll(req as Request, res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('POST /food-items/purchase', () => {
    it('returns 401 if user is not authenticated', async () => {
      const req = createMockReq({ user: undefined, body: { foodItemId: 'item-1', quantity: 1 } });
      const res = createMockRes();

      await controller.purchase(req as Request, res as Response);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 400 if foodItemId is missing', async () => {
      const req = createMockReq({ body: { quantity: 1 } });
      const res = createMockRes();

      await controller.purchase(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 if foodItemId is not a valid UUID', async () => {
      const req = createMockReq({ body: { foodItemId: 'not-a-uuid', quantity: 1 } });
      const res = createMockRes();

      await controller.purchase(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 if quantity is zero', async () => {
      const req = createMockReq({
        body: { foodItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 0 },
      });
      const res = createMockRes();

      await controller.purchase(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 if quantity is negative', async () => {
      const req = createMockReq({
        body: { foodItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: -1 },
      });
      const res = createMockRes();

      await controller.purchase(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 if wallet balance is insufficient', async () => {
      mockPurchase.mockRejectedValue(new Error('Insufficient wallet balance'));

      const req = createMockReq({
        body: { foodItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 },
      });
      const res = createMockRes();

      await controller.purchase(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Insufficient wallet balance');
    });

    it('returns 404 if food item does not exist', async () => {
      mockPurchase.mockRejectedValue(new Error('Food item not found'));

      const req = createMockReq({
        body: { foodItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 },
      });
      const res = createMockRes();

      await controller.purchase(req as Request, res as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Food item not found');
    });

    it('returns 200 with inventory record on successful purchase', async () => {
      const mockResult = {
        userId: 'user-1',
        foodItemId: '550e8400-e29b-41d4-a716-446655440000',
        quantity: 2,
        foodItem: { id: '550e8400-e29b-41d4-a716-446655440000', name: 'Cat Kibble', priceCents: 100 },
      };
      mockPurchase.mockResolvedValue(mockResult);

      const req = createMockReq({
        body: { foodItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 },
      });
      const res = createMockRes();

      await controller.purchase(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Purchase successful');
      expect(res.body.inventory).toEqual(mockResult);
      expect(mockPurchase).toHaveBeenCalledWith('user-1', '550e8400-e29b-41d4-a716-446655440000', 2);
    });

    it('returns 500 on unexpected error', async () => {
      mockPurchase.mockRejectedValue(new Error('DB connection lost'));

      const req = createMockReq({
        body: { foodItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 },
      });
      const res = createMockRes();

      await controller.purchase(req as Request, res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('DB connection lost');
    });
  });
});
