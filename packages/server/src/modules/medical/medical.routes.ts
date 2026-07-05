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

// GET /api/medical-requests/mine — the caller's own requests (profile page)
medicalRoutes.get('/mine', authMiddleware, (req, res) => controller.listMine(req, res));

// GET /api/medical-requests/partners?type= — certified partners (filtered by request type)
medicalRoutes.get('/partners', authMiddleware, (req, res) => controller.listPartners(req, res));

// Owner picks the certified location (awaiting_owner → pending_review)
medicalRoutes.post('/:id/choose-partner', authMiddleware, (req, res) =>
  controller.choosePartner(req, res),
);

// Owner's completion proof: receipt + invoiced amount + in-clinic photos
medicalRoutes.post(
  '/:id/receipt',
  authMiddleware,
  upload.fields([
    { name: 'receipt', maxCount: 1 },
    { name: 'photos', maxCount: 3 },
  ]),
  (req, res) => controller.submitReceipt(req, res),
);

// Partner's completion proof (invoice), entered by staff on the clinic's behalf
medicalRoutes.post(
  '/:id/invoice',
  authMiddleware,
  staffGuard,
  upload.fields([{ name: 'invoice', maxCount: 1 }]),
  (req, res) => controller.submitInvoice(req, res),
);

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

// GET /api/medical-requests/:id — request detail with the full stage trail
medicalRoutes.get('/:id', authMiddleware, (req, res) => controller.getDetail(req, res));

// Completion documents: partner invoice/proof + user receipt (both mandatory,
// Req 9.8) plus optional in-clinic photos from the user.
// ?resubmission=true resubmits after a documentation rejection.
medicalRoutes.post(
  '/:id/complete',
  authMiddleware,
  upload.fields([
    { name: 'invoice', maxCount: 1 },
    { name: 'receipt', maxCount: 1 },
    { name: 'photos', maxCount: 3 },
  ]),
  (req, res) => controller.complete(req, res),
);
