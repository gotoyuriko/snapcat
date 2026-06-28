import { Request, Response } from 'express';
import { z } from 'zod';
import { CatpediaService } from './catpedia.service';

const filterSchema = z.enum(['all', 'discovered', 'owned']).default('all');

export class CatpediaController {
  private catpediaService: CatpediaService;

  constructor(catpediaService?: CatpediaService) {
    this.catpediaService = catpediaService || new CatpediaService();
  }

  /**
   * GET /api/catpedia?filter=all|discovered|owned
   * Returns catpedia entries for the authenticated user.
   * Undiscovered cats are returned as silhouettes (no name, no photo).
   * Requirements: 7.1, 7.2, 7.3, 7.4
   */
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      const parsed = filterSchema.safeParse(req.query.filter);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid filter. Must be one of: all, discovered, owned' });
        return;
      }

      const filter = parsed.data;
      const entries = await this.catpediaService.getCats(userId, filter);

      res.status(200).json(entries);
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message });
    }
  }
}
