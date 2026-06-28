import { Request, Response } from 'express';
import { z } from 'zod';
import { MedicalService } from './medical.service';

/** Zod schema for validating the create medical request body */
const createMedicalRequestSchema = z.object({
  catId: z.string().uuid('catId must be a valid UUID'),
  type: z.enum(['medical', 'grooming'], {
    errorMap: () => ({ message: 'type must be "medical" or "grooming"' }),
  }),
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

      const { catId, type } = parseResult.data;
      const requesterId = req.user!.userId;

      // Collect uploaded files (multer attaches them to req.files)
      const files = req.files as Express.Multer.File[] | undefined;
      const documents = files?.map((f) => ({
        buffer: f.buffer,
        originalName: f.originalname,
      }));

      // Create the medical request
      const medicalRequest = await this.service.createRequest({
        catId,
        requesterId,
        type,
        documents,
      });

      res.status(201).json(medicalRequest);
    } catch (error) {
      console.error('Error creating medical request:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async approve(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
  }

  async uploadDocument(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
  }

  async complete(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
  }
}
