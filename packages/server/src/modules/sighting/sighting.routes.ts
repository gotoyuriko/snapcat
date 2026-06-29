import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { SightingController } from './sighting.controller';
import { SightingService } from './sighting.service';
import { AlertsService } from '../alerts/alerts.service';

const alertsService = new AlertsService();
const sightingService = new SightingService(undefined, alertsService);
const controller = new SightingController(sightingService);

export const sightingRoutes = Router();

// POST /          — Report a new cat sighting
sightingRoutes.post('/', authMiddleware, (req, res) => controller.report(req, res));

// GET  /area      — Get sightings within a bounding box
sightingRoutes.get('/area', authMiddleware, (req, res) => controller.getInArea(req, res));

// GET  /cat/:catId — Get sightings for a specific cat
sightingRoutes.get('/cat/:catId', authMiddleware, (req, res) => controller.getByCat(req, res));
