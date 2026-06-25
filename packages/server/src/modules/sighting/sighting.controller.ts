import { Request, Response } from 'express';

/**
 * TODO: Implement SightingController
 * - Validate incoming sighting reports
 * - Delegate to SightingService
 * - Return created sighting or sighting list
 */

export class SightingController {
  async report(_req: Request, res: Response): Promise<void> {
    // TODO: Validate body, call service
    res.status(501).json({ error: 'Not implemented' });
  }

  async getInArea(_req: Request, res: Response): Promise<void> {
    // TODO: Parse bounding box from query params
    res.status(501).json({ error: 'Not implemented' });
  }

  async getByCat(_req: Request, res: Response): Promise<void> {
    // TODO: Get sightings for a specific cat
    res.status(501).json({ error: 'Not implemented' });
  }
}
