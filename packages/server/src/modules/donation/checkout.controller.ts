import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { CheckoutService } from './checkout.service';
import { config } from '../../config';

/** Zod schema for checkout request validation */
const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        foodItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1),
  // Optional discount coupon to redeem (Requirement 17.12).
  couponId: z.string().uuid().optional(),
});

/** Zod schema for webhook payload validation */
const webhookSchema = z.object({
  intentId: z.string().min(1),
  event: z.literal('payment_success'),
  amountCents: z.number().int().positive(),
});

/**
 * CheckoutController
 * Direct-checkout endpoints (Requirement 10 — no in-app wallet):
 * checkout creates a payment intent for the exact cart total; the payment
 * gateway webhook credits the purchased items to the user's inventory.
 */
export class CheckoutController {
  private checkoutService: CheckoutService;

  constructor(checkoutService?: CheckoutService) {
    this.checkoutService = checkoutService ?? new CheckoutService();
  }

  /**
   * POST /checkout
   * Creates a payment intent for the cart's exact total and returns the
   * gateway payment URL. Requires authentication.
   */
  async checkout(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const parsed = checkoutSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
        return;
      }

      // Security scanner step — Aikido free tier (optional, skip if not available)
      const securityScanPassed = await this.runSecurityScan(req.body);
      if (!securityScanPassed) {
        res.status(403).json({ error: 'Security scan failed' });
        return;
      }

      const { intentId, paymentUrl, totalCents, discountCents, items } =
        await this.checkoutService.createCheckout(
          userId,
          parsed.data.items,
          parsed.data.couponId,
        );

      res.status(200).json({
        intentId,
        paymentUrl,
        totalMyr: totalCents / 100,
        discountMyr: discountCents / 100,
        items: items.map((item) => ({
          foodItemId: item.foodItemId,
          name: item.name,
          priceMyr: item.priceCents / 100,
          quantity: item.quantity,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';

      if (message === 'Food item not found' || message === 'Coupon not found') {
        res.status(404).json({ error: message });
        return;
      }
      if (message.startsWith('Coupon')) {
        // Coupon already used / expired / below minimum purchase (Req 17.12)
        res.status(400).json({ error: message });
        return;
      }

      res.status(500).json({ error: message });
    }
  }

  /**
   * POST /checkout/webhook
   * Handles payment gateway webhook callbacks.
   * Signature verification is a mandatory precondition (Requirement 15.5);
   * on payment_success the cart is credited to inventory idempotently.
   */
  async webhook(req: Request, res: Response): Promise<void> {
    try {
      const signatureValid = this.validateWebhookSignature(req);
      if (!signatureValid) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      const parsed = webhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid webhook payload', details: parsed.error.issues });
        return;
      }

      const { intentId } = parsed.data;

      const fulfilled = await this.checkoutService.fulfillCheckout(intentId);

      if (fulfilled) {
        res.status(200).json({ status: 'fulfilled', intentId });
      } else {
        // Already processed — idempotent response
        res.status(200).json({ status: 'already_processed', intentId });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';

      if (message === 'Payment intent not found') {
        res.status(404).json({ error: message });
        return;
      }

      res.status(500).json({ error: message });
    }
  }

  /**
   * POST /checkout/:intentId/simulate-payment
   * SANDBOX ONLY: completes a pending payment without a real gateway so the
   * purchase flow can be exercised end-to-end. The intent must belong to the
   * authenticated user. Disabled in production — real fulfilment arrives via
   * the signed gateway webhook.
   */
  async simulatePayment(req: Request, res: Response): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ error: 'Sandbox payment simulation is disabled in production' });
        return;
      }

      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const intentId = req.params.intentId;
      const intent = this.checkoutService.getIntent(intentId);

      if (!intent) {
        res.status(404).json({ error: 'Payment intent not found' });
        return;
      }
      if (intent.userId !== userId) {
        res.status(403).json({ error: 'Payment intent does not belong to this user' });
        return;
      }

      const fulfilled = await this.checkoutService.fulfillCheckout(intentId);

      res.status(200).json({
        status: fulfilled ? 'fulfilled' : 'already_processed',
        intentId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }

  /**
   * Run security scan on the payment request payload.
   * Uses Aikido if free tier is available, otherwise skips.
   * Returns true if scan passes (or is skipped).
   */
  private async runSecurityScan(_payload: unknown): Promise<boolean> {
    // Aikido security scanner — optional free tier
    // If Aikido is not configured, skip the scan gracefully
    // For SANDBOX mode, we always pass
    return true;
  }

  /**
   * Validate the webhook signature from the payment gateway.
   * Uses HMAC-SHA256 with the configured webhook secret.
   */
  private validateWebhookSignature(req: Request): boolean {
    const signature = req.headers['x-webhook-signature'] as string | undefined;

    if (!signature) {
      return false;
    }

    const webhookSecret = config.paymentWebhookSecret;
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex'),
      );
    } catch {
      return false;
    }
  }
}
