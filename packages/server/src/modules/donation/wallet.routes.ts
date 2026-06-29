import { Router } from 'express';
import { WalletController } from './wallet.controller';
import { authMiddleware } from '../../middleware/auth';

const controller = new WalletController();

export const walletRoutes = Router();

// Authenticated endpoints
walletRoutes.get('/balance', authMiddleware, (req, res) => controller.getBalance(req, res));
walletRoutes.post('/topup', authMiddleware, (req, res) => controller.topUp(req, res));

// Webhook endpoint (no auth middleware — uses signature validation instead)
walletRoutes.post('/webhook', (req, res) => controller.webhook(req, res));
