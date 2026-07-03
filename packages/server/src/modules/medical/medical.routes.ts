import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { ownershipGate } from '../../middleware/ownershipGate';
import { MedicalController } from './medical.controller';

/**
 * Medical Routes
 * POST /              — Create a medical care request (Lvl7+ ownership required)
 * POST /:id/approve   — Approve request (staff/partner) — TODO
 * POST /:id/document  — Upload receipt/document — TODO
 * POST /:id/complete  — Mark as completed — TODO
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

// Future routes (Task 11.2, 11.3, etc.)
// medicalRoutes.post('/:id/approve', authMiddleware, (req, res) => controller.approve(req, res));
// medicalRoutes.post('/:id/document', authMiddleware, upload.single('document'), (req, res) => controller.uploadDocument(req, res));
// medicalRoutes.post('/:id/complete', authMiddleware, (req, res) => controller.complete(req, res));
