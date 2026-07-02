import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * In-memory store for payment intents (SANDBOX mode).
 * In production, this would be persisted to the database.
 */
const paymentIntents = new Map<string, { userId: string; amountCents: number; status: string }>();

/**
 * WalletService
 * Manages user wallet balances and payment gateway interactions.
 * All amounts are in MYR cents (integer).
 */
export class WalletService {
  /**
   * Get the current wallet balance for a user.
   */
  async getBalance(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });
    if (!user) {
      throw new Error('User not found');
    }
    return user.walletBalance;
  }

  /**
   * Atomically debit the user's wallet. Rejects if balance would go negative.
   */
  async debit(userId: string, amountCents: number, _reason: string): Promise<void> {
    if (amountCents <= 0) {
      throw new Error('Debit amount must be positive');
    }

    // Use a transaction with a conditional update to enforce non-negativity atomically
    const result = await prisma.$executeRaw`
      UPDATE "User"
      SET "walletBalance" = "walletBalance" - ${amountCents}
      WHERE "id" = ${userId} AND "walletBalance" >= ${amountCents}
    `;

    if (result === 0) {
      throw new Error('Insufficient wallet balance');
    }
  }

  /**
   * Atomically credit the user's wallet.
   */
  async credit(userId: string, amountCents: number, _reason: string): Promise<void> {
    if (amountCents <= 0) {
      throw new Error('Credit amount must be positive');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { walletBalance: { increment: amountCents } },
    });
  }

  /**
   * Directly set the user's wallet balance, bypassing credit/debit deltas.
   * TEMPORARY: used only by the test top-up endpoint while the real payment
   * gateway integration is pending. Not used by the production top-up flow.
   */
  async setBalance(userId: string, amountCents: number): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { walletBalance: amountCents },
    });
  }

  /**
   * Initiate a wallet top-up via the SANDBOX payment gateway.
   * Returns a payment URL and intent ID.
   */
  async initiateTopUp(userId: string, amountCents: number): Promise<{ paymentUrl: string; intentId: string }> {
    if (amountCents <= 0) {
      throw new Error('Top-up amount must be positive');
    }

    // Generate a unique intent ID
    const intentId = `pi_${crypto.randomUUID()}`;

    // Store the payment intent (SANDBOX — in-memory)
    paymentIntents.set(intentId, {
      userId,
      amountCents,
      status: 'pending',
    });

    // SANDBOX payment gateway — generate a mock payment URL
    const paymentUrl = `https://sandbox.payment.example.com/pay/${intentId}?amount=${amountCents}`;

    return { paymentUrl, intentId };
  }

  /**
   * Confirm a top-up after payment webhook. Idempotent on intentId.
   * Returns true if the wallet was credited, false if already processed.
   */
  async confirmTopUp(intentId: string): Promise<boolean> {
    const intent = paymentIntents.get(intentId);

    if (!intent) {
      throw new Error('Payment intent not found');
    }

    // Idempotency: if already completed, skip
    if (intent.status === 'completed') {
      return false;
    }

    // Mark as completed before crediting to prevent double-processing
    intent.status = 'completed';
    paymentIntents.set(intentId, intent);

    // Credit the user's wallet
    await this.credit(intent.userId, intent.amountCents, `top-up:${intentId}`);

    return true;
  }

  /**
   * Get a payment intent by ID (for testing/verification).
   */
  getPaymentIntent(intentId: string): { userId: string; amountCents: number; status: string } | undefined {
    return paymentIntents.get(intentId);
  }
}
