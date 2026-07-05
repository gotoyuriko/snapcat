import { Request, Response } from 'express';
import crypto from 'crypto';
import { CheckoutController } from '../checkout.controller';
import { CheckoutService } from '../checkout.service';
import { config } from '../../../config';

// Mock CheckoutService
const mockCreateCheckout = jest.fn();
const mockFulfillCheckout = jest.fn();
const mockGetIntent = jest.fn();

jest.mock('../checkout.service', () => {
  return {
    CheckoutService: jest.fn().mockImplementation(() => ({
      createCheckout: mockCreateCheckout,
      fulfillCheckout: mockFulfillCheckout,
      getIntent: mockGetIntent,
    })),
  };
});

const VALID_ITEM_ID = '550e8400-e29b-41d4-a716-446655440000';

function createMockReq(overrides: Record<string, any> = {}): Partial<Request> {
  return {
    user: { userId: 'user-1', email: 'test@example.com' },
    body: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function createMockRes(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = { statusCode: 0, body: null };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((data: any) => { res.body = data; return res; });
  return res;
}

function signPayload(payload: unknown): string {
  return crypto
    .createHmac('sha256', config.paymentWebhookSecret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

describe('CheckoutController', () => {
  let controller: CheckoutController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CheckoutController(new CheckoutService());
  });

  describe('POST /checkout', () => {
    it('returns 401 if user is not authenticated', async () => {
      const req = createMockReq({ user: undefined, body: { items: [{ foodItemId: VALID_ITEM_ID, quantity: 1 }] } });
      const res = createMockRes();

      await controller.checkout(req as Request, res as Response);

      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for an empty cart', async () => {
      const req = createMockReq({ body: { items: [] } });
      const res = createMockRes();

      await controller.checkout(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('returns 400 for a non-positive quantity', async () => {
      const req = createMockReq({ body: { items: [{ foodItemId: VALID_ITEM_ID, quantity: 0 }] } });
      const res = createMockRes();

      await controller.checkout(req as Request, res as Response);

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 if a food item does not exist', async () => {
      mockCreateCheckout.mockRejectedValue(new Error('Food item not found'));
      const req = createMockReq({ body: { items: [{ foodItemId: VALID_ITEM_ID, quantity: 1 }] } });
      const res = createMockRes();

      await controller.checkout(req as Request, res as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('Food item not found');
    });

    it('returns 200 with intent, payment URL, and MYR totals on success', async () => {
      mockCreateCheckout.mockResolvedValue({
        intentId: 'ci_test',
        paymentUrl: 'https://sandbox.payment.example.com/pay/ci_test?amount=700',
        totalCents: 700,
        items: [{ foodItemId: VALID_ITEM_ID, name: 'Cat Kibble', priceCents: 100, quantity: 7 }],
      });
      const req = createMockReq({ body: { items: [{ foodItemId: VALID_ITEM_ID, quantity: 7 }] } });
      const res = createMockRes();

      await controller.checkout(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.intentId).toBe('ci_test');
      expect(res.body.totalMyr).toBe(7);
      expect(res.body.items).toEqual([
        { foodItemId: VALID_ITEM_ID, name: 'Cat Kibble', priceMyr: 1, quantity: 7 },
      ]);
      expect(mockCreateCheckout).toHaveBeenCalledWith(
        'user-1',
        [{ foodItemId: VALID_ITEM_ID, quantity: 7 }],
        undefined, // no coupon applied
      );
    });
  });

  describe('POST /checkout/webhook', () => {
    const payload = { intentId: 'ci_test', event: 'payment_success', amountCents: 700 };

    it('rejects a missing signature with 401 before any processing', async () => {
      const req = createMockReq({ body: payload, headers: {} });
      const res = createMockRes();

      await controller.webhook(req as Request, res as Response);

      expect(res.statusCode).toBe(401);
      expect(mockFulfillCheckout).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature with 401 before any processing', async () => {
      const req = createMockReq({
        body: payload,
        headers: { 'x-webhook-signature': 'deadbeef' },
      });
      const res = createMockRes();

      await controller.webhook(req as Request, res as Response);

      expect(res.statusCode).toBe(401);
      expect(mockFulfillCheckout).not.toHaveBeenCalled();
    });

    it('fulfills the checkout on a validly signed payment_success', async () => {
      mockFulfillCheckout.mockResolvedValue(true);
      const req = createMockReq({
        body: payload,
        headers: { 'x-webhook-signature': signPayload(payload) },
      });
      const res = createMockRes();

      await controller.webhook(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('fulfilled');
      expect(mockFulfillCheckout).toHaveBeenCalledWith('ci_test');
    });

    it('responds already_processed on duplicate webhook delivery', async () => {
      mockFulfillCheckout.mockResolvedValue(false);
      const req = createMockReq({
        body: payload,
        headers: { 'x-webhook-signature': signPayload(payload) },
      });
      const res = createMockRes();

      await controller.webhook(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('already_processed');
    });

    it('returns 404 for an unknown payment intent', async () => {
      mockFulfillCheckout.mockRejectedValue(new Error('Payment intent not found'));
      const req = createMockReq({
        body: payload,
        headers: { 'x-webhook-signature': signPayload(payload) },
      });
      const res = createMockRes();

      await controller.webhook(req as Request, res as Response);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /checkout/:intentId/simulate-payment', () => {
    it('rejects intents belonging to another user with 403', async () => {
      mockGetIntent.mockReturnValue({ userId: 'someone-else', items: [], totalCents: 100, status: 'pending' });
      const req = createMockReq({ params: { intentId: 'ci_test' } });
      const res = createMockRes();

      await controller.simulatePayment(req as Request, res as Response);

      expect(res.statusCode).toBe(403);
      expect(mockFulfillCheckout).not.toHaveBeenCalled();
    });

    it('fulfills the authenticated user own pending intent', async () => {
      mockGetIntent.mockReturnValue({ userId: 'user-1', items: [], totalCents: 100, status: 'pending' });
      mockFulfillCheckout.mockResolvedValue(true);
      const req = createMockReq({ params: { intentId: 'ci_test' } });
      const res = createMockRes();

      await controller.simulatePayment(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('fulfilled');
    });

    it('returns 404 for an unknown intent', async () => {
      mockGetIntent.mockReturnValue(undefined);
      const req = createMockReq({ params: { intentId: 'ci_missing' } });
      const res = createMockRes();

      await controller.simulatePayment(req as Request, res as Response);

      expect(res.statusCode).toBe(404);
    });
  });
});
