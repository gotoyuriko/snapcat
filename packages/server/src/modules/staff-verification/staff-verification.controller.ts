import { Request, Response } from 'express';
import { z } from 'zod';
import { StaffVerificationService } from './staff-verification.service';

const createPartnerSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['vet', 'salon']),
  contactEmail: z.string().email(),
});

export class StaffVerificationController {
  private service: StaffVerificationService;

  constructor(service?: StaffVerificationService) {
    this.service = service || new StaffVerificationService();
  }

  /**
   * POST /api/staff/partners — Create a new partner (verified=false by default).
   */
  async createPartner(req: Request, res: Response): Promise<void> {
    const parsed = createPartnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      const partner = await this.service.createPartner(parsed.data);
      res.status(201).json(partner);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  /**
   * GET /api/staff/partners — List partners with optional ?verified=true/false filter.
   */
  async listPartners(req: Request, res: Response): Promise<void> {
    try {
      const verifiedParam = req.query.verified;
      let filter: { verified?: boolean } | undefined;

      if (verifiedParam === 'true') {
        filter = { verified: true };
      } else if (verifiedParam === 'false') {
        filter = { verified: false };
      }

      const partners = await this.service.listPartners(filter);
      res.status(200).json(partners);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  /**
   * GET /api/staff/partners/:id — Get a single partner by ID.
   */
  async getPartner(req: Request, res: Response): Promise<void> {
    try {
      const partner = await this.service.getPartner(req.params.id);
      if (!partner) {
        res.status(404).json({ error: 'Partner not found' });
        return;
      }
      res.status(200).json(partner);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  /**
   * PATCH /api/staff/partners/:id/verify — Set partner verified=true.
   */
  async verifyPartner(req: Request, res: Response): Promise<void> {
    try {
      const partner = await this.service.verifyPartner(req.params.id);
      res.status(200).json(partner);
    } catch (err: any) {
      if (err.code === 'P2025') {
        res.status(404).json({ error: 'Partner not found' });
        return;
      }
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  /**
   * PATCH /api/staff/partners/:id/revoke — Set partner verified=false (immediate effect).
   */
  async revokePartner(req: Request, res: Response): Promise<void> {
    try {
      const partner = await this.service.revokePartner(req.params.id);
      res.status(200).json(partner);
    } catch (err: any) {
      if (err.code === 'P2025') {
        res.status(404).json({ error: 'Partner not found' });
        return;
      }
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
}
