import { Request, Response } from 'express';
import { z } from 'zod';
import { DonationService } from './donation.service';

/** Zod schema for create donation request */
const createDonationSchema = z.object({
  catId: z.string().uuid(),
  foodItemId: z.string().uuid(),
});

/**
 * DonationController
 * Handles food donation HTTP endpoints.
 */
export class DonationController {
  private donationService: DonationService;

  constructor(donationService?: DonationService) {
    this.donationService = donationService ?? new DonationService();
  }

  /**
   * POST /donations
   * Create a new food donation from user inventory.
   * Requires authentication.
   */
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const parsed = createDonationSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
        return;
      }

      const { catId, foodItemId } = parsed.data;

      const donation = await this.donationService.createDonation(userId, catId, foodItemId);

      res.status(201).json(donation);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';

      if (message === 'Insufficient inventory' || message === 'Food item not found') {
        res.status(400).json({ error: message });
        return;
      }

      res.status(500).json({ error: message });
    }
  }

  /**
   * GET /donations/history
   * Get donation history for the authenticated user.
   */
  async history(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const donations = await this.donationService.getUserDonations(userId);

      res.status(200).json(donations);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }

  async confirmDelivery(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
  }

  async cancel(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
  }
}
