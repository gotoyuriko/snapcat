import { Router } from 'express';
import { WalletController } from './wallet.controller';
import { authMiddleware } from '../../middleware/auth';

const controller = new WalletController();

export const walletRoutes = Router();

// Authenticated endpoints
walletRoutes.get('/balance', authMiddleware, (req, res) => controller.getBalance(req, res));
walletRoutes.post('/topup', authMiddleware, (req, res) => controller.topUp(req, res));

// TEMPORARY: bypasses the payment gateway for testing the purchase flow.
// Disabled in production (see WalletController.testTopUp). Remove once the
// real payment gate is wired up.
walletRoutes.post('/topup/test', authMiddleware, (req, res) => controller.testTopUp(req, res));

// Webhook endpoint (no auth middleware — uses signature validation instead)
walletRoutes.post('/webhook', (req, res) => controller.webhook(req, res));
