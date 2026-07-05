import { Request, Response } from 'express';
import { z } from 'zod';
import { MedicalService, MedicalRequestNotFoundError } from './medical.service';
import { DocumentStorageService } from './document-storage.service';

/** Zod schema for validating the create medical request body */
const createMedicalRequestSchema = z.object({
  catId: z.string().uuid('catId must be a valid UUID'),
  type: z.enum(['medical', 'grooming'], {
    error: 'type must be "medical" or "grooming"',
  }),
  // Requirement 9.4: a reason description is mandatory.
  reason: z.string().trim().min(10, 'reason must be at least 10 characters').max(2000),
});

const approveSchema = z.object({
  partnerId: z.string().uuid(),
  appointmentDetails: z.string().max(500).optional(),
});

/**
 * MedicalController
 * Handles HTTP request validation and delegates to MedicalService.
 */
export class MedicalController {
  private readonly service: MedicalService;

  constructor() {
    this.service = new MedicalService();
  }

  /**
   * POST /api/medical-requests
   * Create a medical care request.
   *
   * Body: { catId: string, type: "medical" | "grooming" }
   * Files: optional multipart/form-data documents (via multer)
   *
   * Requirement 9.1: Lvl7+ Owner can submit a MedicalRequest
   * Requirement 9.2: Users below Lvl7 get 403 (handled by ownershipGate middleware)
   * Requirement 9.9: Store supporting documents in private object storage
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      const parseResult = createMedicalRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Validation failed',
          details: parseResult.error.issues,
        });
        return;
      }

      const { catId, type, reason } = parseResult.data;
      const requesterId = req.user!.userId;

      // Requirement 9.4: supporting documentation is mandatory.
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({
          error: 'Supporting documentation is required (at least one photo or vet note)',
        });
        return;
      }
      const documents = files.map((f) => ({
        buffer: f.buffer,
        originalName: f.originalname,
      }));

      // Create the medical request
      const medicalRequest = await this.service.createRequest({
        catId,
        requesterId,
        type,
        reason,
        documents,
      });

      // Requirement 9.13: tell the requester which certified partners qualify
      // for reimbursement.
      const certifiedPartners = await this.service.getCertifiedPartners();

      res.status(201).json({ ...medicalRequest, certifiedPartners });
    } catch (error) {
      console.error('Error creating medical request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /partners — certified partner locations shown to the user when they
   * initiate a request (Requirement 9.13).
   */
  async listPartners(req: Request, res: Response): Promise<void> {
    try {
      const certifiedPartners = await this.service.getCertifiedPartners();
      res.status(200).json({ certifiedPartners });
    } catch (error) {
      console.error('Error listing certified partners:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /** GET /cat/:catId/mine — the requester's own requests for a cat. */
  async myRequests(req: Request, res: Response): Promise<void> {
    try {
      const requesterId = req.user!.userId;
      const requests = await this.service.getUserRequestsForCat(requesterId, req.params.catId);
      res.status(200).json({ requests });
    } catch (error) {
      console.error('Error listing medical requests:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /** POST /:id/approve (staff) — approve + assign certified partner (Req 9.5, 9.6). */
  async approve(req: Request, res: Response): Promise<void> {
    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    try {
      await this.service.approveRequest(
        req.params.id,
        parsed.data.partnerId,
        parsed.data.appointmentDetails,
      );
      res.status(200).json({ status: 'approval signalled' });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /** POST /:id/reject (staff) — reject the request (Req 9.7). */
  async reject(req: Request, res: Response): Promise<void> {
    try {
      await this.service.rejectRequest(req.params.id);
      res.status(200).json({ status: 'rejection signalled' });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /** POST /:id/partner-accept (staff, on behalf of partner) — start service. */
  async partnerAccept(req: Request, res: Response): Promise<void> {
    try {
      await this.service.partnerAccept(req.params.id);
      res.status(200).json({ status: 'partner acceptance signalled' });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /**
   * POST /:id/complete — submit BOTH the partner invoice and the user receipt
   * (Req 9.8). Multipart fields: 'invoice' and 'receipt'. ?resubmission=true
   * drives the rejected → reimbursed path.
   */
  async complete(req: Request, res: Response): Promise<void> {
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const invoice = files?.invoice?.[0];
    const receipt = files?.receipt?.[0];
    // Req 9.8: block progression until BOTH documents are actually submitted.
    if (!invoice || !receipt) {
      res.status(400).json({
        error: 'Both the partner invoice and the user receipt are required',
      });
      return;
    }
    try {
      const urls = await this.service.submitCompletionDocuments(
        req.params.id,
        { buffer: invoice.buffer, originalName: invoice.originalname },
        { buffer: receipt.buffer, originalName: receipt.originalname },
        req.query.resubmission === 'true',
      );
      res.status(200).json({ status: 'completion documents submitted', ...urls });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /** GET /documents/:fileName?expires=&sig= — serve a signed private document (Req 9.12). */
  async serveDocument(req: Request, res: Response): Promise<void> {
    const storage = new DocumentStorageService();
    const fileName = req.params.fileName;
    const expires = parseInt(String(req.query.expires), 10);
    const sig = String(req.query.sig ?? '');

    if (!fileName || !Number.isFinite(expires) || !sig) {
      res.status(400).json({ error: 'Missing signed URL parameters' });
      return;
    }
    if (!storage.verifySignedUrl(fileName, expires, sig)) {
      res.status(403).json({ error: 'Invalid or expired document URL' });
      return;
    }
    const filePath = storage.resolveDocumentPath(fileName);
    if (!filePath) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.sendFile(filePath);
  }

  private handleError(err: unknown, res: Response): void {
    if (err instanceof MedicalRequestNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message === 'Partner not found or not certified') {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Medical request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
