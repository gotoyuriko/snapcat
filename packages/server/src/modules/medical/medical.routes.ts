import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { ownershipGate } from '../../middleware/ownershipGate';
import { staffGuard } from '../../middleware/staffGuard';
import { MedicalController } from './medical.controller';

/**
 * Medical Routes
 * POST /                    — Create a medical care request (Lvl7+ ownership required)
 * POST /:id/approve         — Staff approves + assigns certified partner (signals workflow)
 * POST /:id/reject          — Staff rejects (signals workflow)
 * POST /:id/partner-accept  — Partner accepted the assignment (staff-entered)
 * POST /:id/complete        — Submit partner invoice + user receipt (both required)
 * GET  /documents/:fileName — Serve a signed private document
 */

const controller = new MedicalController();

// Multer config: store files in memory for processing before upload to object storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 5, // Max 5 documents per request
  },
});

export const medicalRoutes = Router();

// POST /api/medical-requests — Create a medical care request
// Auth: JWT required, Ownership: Lvl7+ for the specified cat
medicalRoutes.post(
  '/',
  authMiddleware,
  upload.array('documents', 5),
  ownershipGate(7),
  (req, res) => controller.create(req, res),
);

// GET /api/medical-requests/partners — certified partner locations (Req 9.13)
medicalRoutes.get('/partners', authMiddleware, (req, res) => controller.listPartners(req, res));

// GET /api/medical-requests/cat/:catId/mine — the requester's own requests for a cat
medicalRoutes.get('/cat/:catId/mine', authMiddleware, (req, res) => controller.myRequests(req, res));

// GET /api/medical-requests/documents/:fileName — signed private document access (Req 9.12).
// No auth middleware: access control is the HMAC signature + expiry themselves.
medicalRoutes.get('/documents/:fileName', (req, res) => controller.serveDocument(req, res));

// Staff review decisions — signal the Temporal workflow (Req 9.5–9.7)
medicalRoutes.post('/:id/approve', authMiddleware, staffGuard, (req, res) =>
  controller.approve(req, res),
);
medicalRoutes.post('/:id/reject', authMiddleware, staffGuard, (req, res) =>
  controller.reject(req, res),
);

// Partner acceptance — partners have no login of their own, so staff enter it
medicalRoutes.post('/:id/partner-accept', authMiddleware, staffGuard, (req, res) =>
  controller.partnerAccept(req, res),
);

// Completion documents: partner invoice + user receipt, both mandatory (Req 9.8).
// ?resubmission=true resubmits after a documentation rejection.
medicalRoutes.post(
  '/:id/complete',
  authMiddleware,
  upload.fields([
    { name: 'invoice', maxCount: 1 },
    { name: 'receipt', maxCount: 1 },
  ]),
  (req, res) => controller.complete(req, res),
);
