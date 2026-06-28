/**
 * Sighting Module
 * Handles cat sighting reports with GPS fuzzing for privacy.
 */

export { SightingService, DiscoveredMapPin, UndiscoveredMapPin, CatMapPin } from './sighting.service';
export { SightingController } from './sighting.controller';
export { sightingRoutes } from './sighting.routes';
export { mapRoutes } from './map.routes';
export { fuzzCoordinates } from './gps-fuzz';
