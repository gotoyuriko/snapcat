import { Sighting } from '@codingkitty/shared';

/**
 * TODO: Implement SightingService
 * - Create sighting records with fuzzed coordinates
 * - Query sightings by area (using PostGIS or simple bounds)
 * - Update cat's lastKnownApprox location on new sighting
 */

export class SightingService {
  async reportSighting(
    _catId: string,
    _reporterId: string,
    _lat: number,
    _lng: number,
    _photoUrl: string,
    _type: string,
  ): Promise<Sighting> {
    // TODO: Fuzz coordinates, create sighting, update cat location
    throw new Error('Not implemented');
  }

  async getSightingsInArea(_neLat: number, _neLng: number, _swLat: number, _swLng: number): Promise<Sighting[]> {
    // TODO: Query sightings within bounding box
    throw new Error('Not implemented');
  }

  async getCatSightings(_catId: string, _limit: number = 20): Promise<Sighting[]> {
    // TODO: Get recent sightings for a cat
    throw new Error('Not implemented');
  }
}
