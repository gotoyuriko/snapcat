import { Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../../../config';

// --- Prisma mock setup ---
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    user: { findUnique: jest.fn(), update: jest.fn() },
    $executeRaw: jest.fn(),
  })),
}));

import { WalletController } from '../wallet.controller';
import { WalletService } from '../wallet.service';

describe('WalletController', () => {
  let controller: WalletController;
  let mockWalletService: jest.Mocked<WalletService>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    mockWalletService = {
      getBalance: jest.fn(),
      debit: jest.fn(),
      credit: jest.fn(),
      initiateTopUp: jest.fn(),
      confirmTopUp: jest.fn(),
      getPaymentIntent: jest.fn(),
    } as unknown as jest.Mocked<WalletService>;

    controller = new WalletController(mockWalletService);

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockRes = { status: statusMock, json: jsonMock };
    mockReq = {
      user: { userId: 'user-123', email: 'test@example.com' },
      body: {},
      headers: {},
    };
  });

  // ─── POST /wallet/topup ────────────────────────────────────────────────────

  describe('topUp()', () => {
    it('returns paymentUrl and intentId on valid request', async () => {
      mockReq.body = { amountCents: 5000 };
      mockWalletService.initiateTopUp.mockResolvedValue({
        paymentUrl: 'https://sandbox.payment.example.com/pay/pi_123',
        intentId: 'pi_123',
      });

      await controller.topUp(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({
        paymentUrl: 'https://sandbox.payment.example.com/pay/pi_123',
        intentId: 'pi_123',
      });
    });

    it('returns 401 if user is not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.body = { amountCents: 5000 };

      await controller.topUp(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns 400 on invalid amountCents (non-positive)', async () => {
      mockReq.body = { amountCents: -100 };

      await controller.topUp(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid request' }));
    });

    it('returns 400 on missing amountCents', async () => {
      mockReq.body = {};

      await controller.topUp(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('returns 400 on non-integer amountCents', async () => {
      mockReq.body = { amountCents: 50.5 };

      await controller.topUp(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  // ─── POST /wallet/webhook ──────────────────────────────────────────────────

  describe('webhook()', () => {
    function createValidWebhookReq(body: object): Partial<Request> {
      const payload = JSON.stringify(body);
      const signature = crypto
        .createHmac('sha256', config.paymentWebhookSecret)
        .update(payload)
        .digest('hex');

      return {
        body,
        headers: { 'x-webhook-signature': signature },
      };
    }

    it('credits wallet on valid webhook with correct signature', async () => {
      const body = { intentId: 'pi_123', event: 'payment_success', amountCents: 5000 };
      mockReq = createValidWebhookReq(body);
      mockWalletService.confirmTopUp.mockResolvedValue(true);

      await controller.webhook(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ status: 'credited', intentId: 'pi_123' });
      expect(mockWalletService.confirmTopUp).toHaveBeenCalledWith('pi_123');
    });

    it('returns already_processed for duplicate webhook (idempotent)', async () => {
      const body = { intentId: 'pi_123', event: 'payment_success', amountCents: 5000 };
      mockReq = createValidWebhookReq(body);
      mockWalletService.confirmTopUp.mockResolvedValue(false);

      await controller.webhook(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ status: 'already_processed', intentId: 'pi_123' });
    });

    it('returns 401 on missing webhook signature', async () => {
      mockReq = {
        body: { intentId: 'pi_123', event: 'payment_success', amountCents: 5000 },
        headers: {},
      };

      await controller.webhook(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid webhook signature' });
    });

    it('returns 401 on invalid webhook signature', async () => {
      mockReq = {
        body: { intentId: 'pi_123', event: 'payment_success', amountCents: 5000 },
        headers: { 'x-webhook-signature': 'invalid_signature_here_abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567' },
      };

      await controller.webhook(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid webhook signature' });
    });

    it('returns 400 on invalid webhook payload schema', async () => {
      const body = { intentId: 'pi_123', event: 'wrong_event', amountCents: 5000 };
      mockReq = createValidWebhookReq(body);

      await controller.webhook(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('returns 404 when intent not found', async () => {
      const body = { intentId: 'pi_unknown', event: 'payment_success', amountCents: 5000 };
      mockReq = createValidWebhookReq(body);
      mockWalletService.confirmTopUp.mockRejectedValue(new Error('Payment intent not found'));

      await controller.webhook(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Payment intent not found' });
    });
  });

  // ─── GET /wallet/balance ───────────────────────────────────────────────────

  describe('getBalance()', () => {
    it('returns the user balance', async () => {
      mockWalletService.getBalance.mockResolvedValue(12500);

      await controller.getBalance(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ balance: 12500 });
    });

    it('returns 401 if user is not authenticated', async () => {
      mockReq.user = undefined;

      await controller.getBalance(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });
  });
});
