import crypto from 'crypto';

// --- Prisma mock setup ---
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $executeRaw: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

import { WalletService } from '../wallet.service';

describe('WalletService', () => {
  let walletService: WalletService;

  beforeEach(() => {
    walletService = new WalletService();
    jest.clearAllMocks();
  });

  // ─── getBalance ─────────────────────────────────────────────────────────────

  describe('getBalance()', () => {
    it('returns the user wallet balance in cents', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ walletBalance: 5000 });

      const balance = await walletService.getBalance('user-123');

      expect(balance).toBe(5000);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: { walletBalance: true },
      });
    });

    it('throws if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(walletService.getBalance('nonexistent')).rejects.toThrow('User not found');
    });
  });

  // ─── debit ──────────────────────────────────────────────────────────────────

  describe('debit()', () => {
    it('succeeds when user has sufficient balance', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1); // 1 row affected

      await expect(walletService.debit('user-123', 1000, 'donation')).resolves.toBeUndefined();
    });

    it('throws Insufficient wallet balance when balance too low', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(0); // 0 rows affected

      await expect(walletService.debit('user-123', 9999, 'donation')).rejects.toThrow(
        'Insufficient wallet balance',
      );
    });

    it('throws if amount is zero or negative', async () => {
      await expect(walletService.debit('user-123', 0, 'test')).rejects.toThrow(
        'Debit amount must be positive',
      );
      await expect(walletService.debit('user-123', -100, 'test')).rejects.toThrow(
        'Debit amount must be positive',
      );
    });
  });

  // ─── credit ─────────────────────────────────────────────────────────────────

  describe('credit()', () => {
    it('increments wallet balance atomically', async () => {
      mockPrisma.user.update.mockResolvedValue({ walletBalance: 6000 });

      await walletService.credit('user-123', 1000, 'top-up');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { walletBalance: { increment: 1000 } },
      });
    });

    it('throws if amount is zero or negative', async () => {
      await expect(walletService.credit('user-123', 0, 'test')).rejects.toThrow(
        'Credit amount must be positive',
      );
      await expect(walletService.credit('user-123', -50, 'test')).rejects.toThrow(
        'Credit amount must be positive',
      );
    });
  });

  // ─── initiateTopUp ──────────────────────────────────────────────────────────

  describe('initiateTopUp()', () => {
    it('returns a payment URL and intent ID', async () => {
      const result = await walletService.initiateTopUp('user-123', 5000);

      expect(result.paymentUrl).toContain('sandbox.payment.example.com');
      expect(result.paymentUrl).toContain(result.intentId);
      expect(result.intentId).toMatch(/^pi_/);
    });

    it('throws if amount is zero or negative', async () => {
      await expect(walletService.initiateTopUp('user-123', 0)).rejects.toThrow(
        'Top-up amount must be positive',
      );
      await expect(walletService.initiateTopUp('user-123', -100)).rejects.toThrow(
        'Top-up amount must be positive',
      );
    });
  });

  // ─── confirmTopUp ───────────────────────────────────────────────────────────

  describe('confirmTopUp()', () => {
    it('credits the wallet on first confirmation', async () => {
      mockPrisma.user.update.mockResolvedValue({ walletBalance: 5000 });

      // First initiate a top-up to create the intent
      const { intentId } = await walletService.initiateTopUp('user-123', 5000);

      // Confirm it
      const credited = await walletService.confirmTopUp(intentId);

      expect(credited).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { walletBalance: { increment: 5000 } },
      });
    });

    it('is idempotent — second confirmation returns false', async () => {
      mockPrisma.user.update.mockResolvedValue({ walletBalance: 5000 });

      const { intentId } = await walletService.initiateTopUp('user-123', 5000);

      await walletService.confirmTopUp(intentId);
      const secondResult = await walletService.confirmTopUp(intentId);

      expect(secondResult).toBe(false);
      // Only one call to credit (via user.update)
      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });

    it('throws for unknown intent ID', async () => {
      await expect(walletService.confirmTopUp('pi_nonexistent')).rejects.toThrow(
        'Payment intent not found',
      );
    });
  });
});
