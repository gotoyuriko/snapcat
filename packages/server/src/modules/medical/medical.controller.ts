import { Request, Response } from 'express';

/**
 * TODO: Implement MedicalController
 * - Validate medical request submissions
 * - Delegate to MedicalService
 */

export class MedicalController {
  async create(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'Not implemented' });
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
