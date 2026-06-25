import { Sighting, BoundingBox } from '@codingkitty/shared';

/**
 * Sighting Module
 * Handles cat sighting reports with GPS fuzzing for privacy.
 */

export interface SightingModule {
  /** Report a new cat sighting */
  reportSighting(catId: string, reporterId: string, lat: number, lng: number, photoUrl: string, type: string): Promise<Sighting>;
  /** Get sightings within a bounding box */
  getSightingsInArea(bounds: BoundingBox): Promise<Sighting[]>;
  /** Get recent sightings for a specific cat */
  getCatSightings(catId: string, limit?: number): Promise<Sighting[]>;
}

export { SightingService } from './sighting.service';
export { SightingController } from './sighting.controller';
export { sightingRoutes } from './sighting.routes';
