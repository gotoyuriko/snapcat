import { Request, Response } from 'express';
import { z } from 'zod';
import { SightingService } from './sighting.service';

// Req 5.7: REST-reported sightings are always 'manual'. Scan sightings are
// created exclusively by the recognition pipeline, so clients cannot claim
// the 'scan' type (which would let them move a cat's map location).
const reportSightingSchema = z.object({
  catId: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  photoUrl: z.string().default(''),
});

export class SightingController {
  private sightingService: SightingService;

  constructor(sightingService?: SightingService) {
    this.sightingService = sightingService || new SightingService();
  }

  async report(req: Request, res: Response): Promise<void> {
    const parsed = reportSightingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    try {
      const { catId, lat, lng, photoUrl } = parsed.data;
      const reporterId = req.user!.userId;

      const sighting = await this.sightingService.appendSighting(
        catId,
        reporterId,
        { lat, lng },
        photoUrl,
        'manual',
      );

      res.status(201).json(sighting);
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message });
    }
  }

  async getInArea(req: Request, res: Response): Promise<void> {
    try {
      const neLat = parseFloat(req.query.neLat as string);
      const neLng = parseFloat(req.query.neLng as string);
      const swLat = parseFloat(req.query.swLat as string);
      const swLng = parseFloat(req.query.swLng as string);

      if ([neLat, neLng, swLat, swLng].some(isNaN)) {
        res.status(400).json({ error: 'Missing or invalid bounding box parameters (neLat, neLng, swLat, swLng)' });
        return;
      }

      const sightings = await this.sightingService.getSightingsInArea(neLat, neLng, swLat, swLng);
      res.status(200).json(sightings);
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message });
    }
  }

  async getByCat(req: Request, res: Response): Promise<void> {
    try {
      const { catId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const sightings = await this.sightingService.getCatSightings(catId, limit);
      res.status(200).json(sightings);
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message });
    }
  }

  /**
   * GET /map — Return cat map pins filtered by user's discovery set.
   * Discovered cats get full pin data; undiscovered get silhouette only.
   * Optional bounding box query params: neLat, neLng, swLat, swLng
   * Implements Requirements 2.1, 2.2, 2.3, 2.4
   */
  async getMapPins(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      // Parse optional bounding box params
      const neLat = req.query.neLat ? parseFloat(req.query.neLat as string) : undefined;
      const neLng = req.query.neLng ? parseFloat(req.query.neLng as string) : undefined;
      const swLat = req.query.swLat ? parseFloat(req.query.swLat as string) : undefined;
      const swLng = req.query.swLng ? parseFloat(req.query.swLng as string) : undefined;

      let bounds: { neLat: number; neLng: number; swLat: number; swLng: number } | undefined;

      if (neLat !== undefined && neLng !== undefined && swLat !== undefined && swLng !== undefined) {
        if ([neLat, neLng, swLat, swLng].some(isNaN)) {
          res.status(400).json({ error: 'Invalid bounding box parameters (neLat, neLng, swLat, swLng must be numbers)' });
          return;
        }
        bounds = { neLat, neLng, swLat, swLng };
      }

      const pins = await this.sightingService.getMapPins(userId, bounds);
      res.status(200).json(pins);
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ error: err.message });
    }
  }
}
