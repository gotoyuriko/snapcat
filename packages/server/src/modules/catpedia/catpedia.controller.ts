import { Request, Response } from 'express';

/**
 * TODO: Implement CatpediaController
 * - Serve cat breed and care information
 * - Search/filter catpedia entries
 */

export class CatpediaController {
  async getAll(_req: Request, res: Response): Promise<void> {
    // TODO: Return all catpedia entries (with pagination)
    res.status(501).json({ error: 'Not implemented' });
  }

  async getByBreed(_req: Request, res: Response): Promise<void> {
    // TODO: Return catpedia entry for specific breed
    res.status(501).json({ error: 'Not implemented' });
  }
}
