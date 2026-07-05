import { Router } from 'express';
import { CheckoutController } from './checkout.controller';
import { authMiddleware } from '../../middleware/auth';
import { financialSecurityMiddleware } from '../../middleware/financialSecurity';

const controller = new CheckoutController();

export const checkoutRoutes = Router();

// Apply financial security middleware to all checkout routes
// (rate limiting, input sanitization, security headers)
checkoutRoutes.use(financialSecurityMiddleware);

// Authenticated endpoints
checkoutRoutes.post('/', authMiddleware, (req, res) => controller.checkout(req, res));

// SANDBOX ONLY: completes a pending payment without a real gateway.
// Disabled in production (see CheckoutController.simulatePayment).
checkoutRoutes.post('/:intentId/simulate-payment', authMiddleware, (req, res) =>
  controller.simulatePayment(req, res),
);

// Webhook endpoint (no auth middleware — uses signature validation instead)
checkoutRoutes.post('/webhook', (req, res) => controller.webhook(req, res));
