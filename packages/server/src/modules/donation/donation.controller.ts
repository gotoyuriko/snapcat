import { Request, Response } from 'express';

/**
 * TODO: Implement DonationController
 * - Validate donation requests
 * - Delegate to DonationService
 */

export class DonationController {
  async create(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
  }

  async confirmDelivery(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
  }

  async cancel(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
  }

  async history(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
  }
}
