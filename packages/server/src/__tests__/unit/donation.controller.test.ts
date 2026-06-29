import { Request, Response } from 'express';
import { DonationController } from '../../modules/donation/donation.controller';

// Mock DonationService
const mockCreateDonation = jest.fn();
const mockGetUserDonations = jest.fn();

jest.mock('../../modules/donation/donation.service', () => {
  return {
    DonationService: jest.fn().mockImplementation(() => ({
      createDonation: mockCreateDonation,
      getUserDonations: mockGetUserDonations,
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

describe('DonationController', () => {
  let controller: DonationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new DonationController();
  });

  describe('POST /donations (create)', () => {
    it('returns 401 if user is not authenticated', async () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 400 if catId is missing', async () => {
      const req = createMockReq({
        body: { foodItemId: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid request');
    });

    it('returns 400 if foodItemId is missing', async () => {
      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid request');
    });

    it('returns 400 if catId is not a valid UUID', async () => {
      const req = createMockReq({
        body: { catId: 'not-a-uuid', foodItemId: '550e8400-e29b-41d4-a716-446655440000' },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid request');
    });

    it('returns 400 if foodItemId is not a valid UUID', async () => {
      const req = createMockReq({
        body: { catId: '550e8400-e29b-41d4-a716-446655440000', foodItemId: 'invalid' },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Invalid request');
    });

    it('returns 400 if inventory is insufficient', async () => {
      mockCreateDonation.mockRejectedValue(new Error('Insufficient inventory'));

      const req = createMockReq({
        body: {
          catId: '550e8400-e29b-41d4-a716-446655440000',
          foodItemId: '660e8400-e29b-41d4-a716-446655440000',
        },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Insufficient inventory');
    });

    it('returns 400 if food item is not found', async () => {
      mockCreateDonation.mockRejectedValue(new Error('Food item not found'));

      const req = createMockReq({
        body: {
          catId: '550e8400-e29b-41d4-a716-446655440000',
          foodItemId: '660e8400-e29b-41d4-a716-446655440000',
        },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Food item not found');
    });

    it('returns 201 with donation on successful creation', async () => {
      const mockDonation = {
        id: 'donation-1',
        donorId: 'user-1',
        catId: '550e8400-e29b-41d4-a716-446655440000',
        foodItemId: '660e8400-e29b-41d4-a716-446655440000',
        foodItem: 'Cat Kibble',
        amountCents: 500,
        source: 'wallet',
        status: 'escrowed',
        workflowId: 'donation-1',
        createdAt: new Date().toISOString(),
      };
      mockCreateDonation.mockResolvedValue(mockDonation);

      const req = createMockReq({
        body: {
          catId: '550e8400-e29b-41d4-a716-446655440000',
          foodItemId: '660e8400-e29b-41d4-a716-446655440000',
        },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(mockDonation);
      expect(mockCreateDonation).toHaveBeenCalledWith(
        'user-1',
        '550e8400-e29b-41d4-a716-446655440000',
        '660e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('returns 500 on unexpected error', async () => {
      mockCreateDonation.mockRejectedValue(new Error('DB connection lost'));

      const req = createMockReq({
        body: {
          catId: '550e8400-e29b-41d4-a716-446655440000',
          foodItemId: '660e8400-e29b-41d4-a716-446655440000',
        },
      });
      const res = createMockRes();

      await controller.create(req as Request, res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('DB connection lost');
    });
  });

  describe('GET /donations/history', () => {
    it('returns 401 if user is not authenticated', async () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      await controller.history(req as Request, res as Response);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 200 with donation history', async () => {
      const mockDonations = [
        {
          id: 'donation-1',
          donorId: 'user-1',
          catId: 'cat-1',
          foodItemId: 'item-1',
          foodItem: 'Cat Kibble',
          amountCents: 500,
          source: 'wallet',
          status: 'escrowed',
          workflowId: 'donation-1',
          createdAt: new Date().toISOString(),
        },
      ];
      mockGetUserDonations.mockResolvedValue(mockDonations);

      const req = createMockReq();
      const res = createMockRes();

      await controller.history(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockDonations);
      expect(mockGetUserDonations).toHaveBeenCalledWith('user-1');
    });

    it('returns 500 on service error', async () => {
      mockGetUserDonations.mockRejectedValue(new Error('DB error'));

      const req = createMockReq();
      const res = createMockRes();

      await controller.history(req as Request, res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });
});
