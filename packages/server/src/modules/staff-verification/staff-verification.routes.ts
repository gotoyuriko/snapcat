import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { staffGuard } from '../../middleware/staffGuard';
import { StaffVerificationController } from './staff-verification.controller';

const controller = new StaffVerificationController();

export const staffVerificationRoutes = Router();

// All routes require authentication + staff role
staffVerificationRoutes.use(authMiddleware, staffGuard);

// POST /api/staff/partners — Create a new partner
staffVerificationRoutes.post('/partners', (req, res) => controller.createPartner(req, res));

// GET /api/staff/partners — List partners (optional ?verified=true/false)
staffVerificationRoutes.get('/partners', (req, res) => controller.listPartners(req, res));

// GET /api/staff/partners/:id — Get single partner
staffVerificationRoutes.get('/partners/:id', (req, res) => controller.getPartner(req, res));

// PATCH /api/staff/partners/:id/verify — Set verified=true
staffVerificationRoutes.patch('/partners/:id/verify', (req, res) => controller.verifyPartner(req, res));

// PATCH /api/staff/partners/:id/revoke — Set verified=false (immediate effect)
staffVerificationRoutes.patch('/partners/:id/revoke', (req, res) => controller.revokePartner(req, res));

// PATCH /api/staff/cats/:catId/name — staff override for reported cat names (Req 19.8)
staffVerificationRoutes.patch('/cats/:catId/name', (req, res) => controller.renameCat(req, res));
