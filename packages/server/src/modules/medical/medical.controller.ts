import { Request, Response } from 'express';
import { z } from 'zod';
import { MedicalService, MedicalRequestNotFoundError } from './medical.service';
import { DocumentStorageService } from './document-storage.service';

/** Zod schema for validating the create medical request body */
const createMedicalRequestSchema = z.object({
  catId: z.string().uuid('catId must be a valid UUID'),
  type: z.enum(['medical', 'grooming'], {
    message: 'type must be "medical" or "grooming"',
  }),
  // Requirement 9.4: a reason description is mandatory.
  reason: z.string().trim().min(10, 'reason must be at least 10 characters').max(2000),
});

// Owner's location choice (awaiting_owner stage).
const choosePartnerSchema = z.object({
  partnerId: z.string().uuid(),
});

// Requirement 9.7: rejection must carry a reason for the user.
const rejectSchema = z.object({
  reason: z.string().trim().min(5, 'reason must be at least 5 characters').max(500),
});

// Requirement 9.9: the invoiced amount to reimburse from the pool (MYR cents).
const completeSchema = z.object({
  amountCents: z.coerce.number().int().positive().max(1_000_000),
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
      // for reimbursement — filtered to the request type (medical → vets,
      // grooming → salons).
      const certifiedPartners = await this.service.getCertifiedPartners(type);

      res.status(201).json({ ...medicalRequest, certifiedPartners });
    } catch (error) {
      console.error('Error creating medical request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /** GET /mine — the authenticated user's own requests, for the profile page. */
  async listMine(req: Request, res: Response): Promise<void> {
    try {
      const requests = await this.service.getMyRequests(req.user!.userId);
      res.status(200).json({ requests });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /** GET /cat/:catId/mine — the requester's own requests for a cat. */
  async myRequests(req: Request, res: Response): Promise<void> {
    try {
      const requesterId = req.user!.userId;
      const requests = await this.service.getUserRequestsForCat(requesterId, req.params.catId);
      res.status(200).json({ requests });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /** GET /partners?type=medical|grooming — certified partners for a request type. */
  async listPartners(req: Request, res: Response): Promise<void> {
    try {
      const type = typeof req.query?.type === 'string' ? req.query.type : undefined;
      const partners = await this.service.getCertifiedPartners(type);
      res.status(200).json({ partners });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /**
   * POST /:id/receipt — the OWNER submits their payment receipt, the invoiced
   * amount, and in-clinic photos after the visit (Req 9.8, user side).
   * ?resubmission=true resubmits after a documentation rejection.
   */
  async submitReceipt(req: Request, res: Response): Promise<void> {
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const receipt = files?.receipt?.[0];
    if (!receipt) {
      res.status(400).json({ error: 'A receipt file is required' });
      return;
    }
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'A positive invoiced amountCents is required',
        details: parsed.error.issues,
      });
      return;
    }
    try {
      const photos = (files?.photos ?? []).map((p) => ({
        buffer: p.buffer,
        originalName: p.originalname,
      }));
      const result = await this.service.submitUserReceipt(
        req.params.id,
        req.user!.userId,
        { buffer: receipt.buffer, originalName: receipt.originalname },
        photos,
        parsed.data.amountCents,
        req.query.resubmission === 'true',
      );
      res.status(200).json({ status: 'receipt submitted', ...result });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /**
   * POST /:id/invoice (staff) — the PARTNER's proof, entered on the clinic's
   * behalf (Req 9.8, partner side). Triggers verification once the user's
   * receipt is also in.
   */
  async submitInvoice(req: Request, res: Response): Promise<void> {
    const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
    const invoice = files?.invoice?.[0];
    if (!invoice) {
      res.status(400).json({ error: 'An invoice file is required' });
      return;
    }
    try {
      const result = await this.service.submitPartnerInvoice(
        req.params.id,
        { buffer: invoice.buffer, originalName: invoice.originalname },
        req.query.resubmission === 'true',
      );
      res.status(200).json({ status: 'invoice submitted', ...result });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /** GET /:id — one request with its full stage trail (requester only). */
  async getDetail(req: Request, res: Response): Promise<void> {
    try {
      const request = await this.service.getRequestDetail(req.params.id, req.user!.userId);
      res.status(200).json(request);
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /**
   * POST /:id/choose-partner — the owner picks the certified location
   * (awaiting_owner → pending_review).
   */
  async choosePartner(req: Request, res: Response): Promise<void> {
    const parsed = choosePartnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    try {
      await this.service.choosePartner(req.params.id, req.user!.userId, parsed.data.partnerId);
      res.status(200).json({ status: 'location choice signalled' });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /** POST /:id/approve (staff) — approve; owner then chooses the location (Req 9.5). */
  async approve(req: Request, res: Response): Promise<void> {
    try {
      await this.service.approveRequest(req.params.id);
      res.status(200).json({ status: 'approval signalled' });
    } catch (err) {
      this.handleError(err, res);
    }
  }

  /** POST /:id/reject (staff) — reject the request with a reason (Req 9.7). */
  async reject(req: Request, res: Response): Promise<void> {
    const parsed = rejectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
      return;
    }
    try {
      await this.service.rejectRequest(req.params.id, parsed.data.reason);
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
    // Req 9.9: the invoiced amount drives how much is released from the pool.
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'A positive invoiced amountCents is required',
        details: parsed.error.issues,
      });
      return;
    }
    try {
      const photos = (files?.photos ?? []).map((p) => ({
        buffer: p.buffer,
        originalName: p.originalname,
      }));
      const urls = await this.service.submitCompletionDocuments(
        req.params.id,
        { buffer: invoice.buffer, originalName: invoice.originalname },
        { buffer: receipt.buffer, originalName: receipt.originalname },
        req.query.resubmission === 'true',
        parsed.data.amountCents,
        photos,
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
    const badRequestMessages = [
      'Partner not found or not certified',
      'Request is not awaiting a location choice',
      'Medical requests must use a certified vet clinic',
      'Grooming requests must use a certified grooming salon',
    ];
    if (badRequestMessages.includes(message)) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Medical request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
