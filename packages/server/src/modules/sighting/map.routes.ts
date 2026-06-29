import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { SightingController } from './sighting.controller';
import { SightingService } from './sighting.service';
import { AlertsService } from '../alerts/alerts.service';

const alertsService = new AlertsService();
const sightingService = new SightingService(undefined, alertsService);
const controller = new SightingController(sightingService);

export const mapRoutes = Router();

// GET /api/map — Return cat map pins filtered by user's discovery set
// Discovered cats: full pin data. Undiscovered: silhouette with approximate area only.
// Optional query params: neLat, neLng, swLat, swLng (bounding box)
// Implements Requirements 2.1, 2.2, 2.3, 2.4
mapRoutes.get('/', authMiddleware, (req, res) => controller.getMapPins(req, res));
