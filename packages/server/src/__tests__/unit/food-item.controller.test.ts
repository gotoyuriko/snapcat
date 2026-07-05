import { Request, Response } from 'express';
import { FoodItemController } from '../../modules/donation/food-item.controller';

// Mock FoodItemService
const mockGetAll = jest.fn();
const mockGetUserInventory = jest.fn();

jest.mock('../../modules/donation/food-item.service', () => {
  return {
    FoodItemService: jest.fn().mockImplementation(() => ({
      getAll: mockGetAll,
      getUserInventory: mockGetUserInventory,
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
});
