import { Router } from 'express';
import { DonationController } from './donation.controller';
import { authMiddleware } from '../../middleware/auth';
import { financialSecurityMiddleware } from '../../middleware/financialSecurity';

const controller = new DonationController();

export const donationRoutes = Router();

// Apply financial security middleware to all donation routes
// (rate limiting, input sanitization, security headers)
donationRoutes.use(financialSecurityMiddleware);

// POST /donations — Create a new food donation
donationRoutes.post('/', authMiddleware, (req, res) => controller.create(req, res));

// GET /donations/history — Get user's donation history
donationRoutes.get('/history', authMiddleware, (req, res) => controller.history(req, res));

// POST /donations/:id/deliver — Confirm food delivery (future)
donationRoutes.post('/:id/deliver', authMiddleware, (req, res) => controller.confirmDelivery(req, res));

// POST /donations/:id/cancel — Cancel/refund donation (future)
donationRoutes.post('/:id/cancel', authMiddleware, (req, res) => controller.cancel(req, res));
