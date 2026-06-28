import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { SightingController } from './sighting.controller';

const controller = new SightingController();

export const sightingRoutes = Router();

// POST /          — Report a new cat sighting
sightingRoutes.post('/', authMiddleware, (req, res) => controller.report(req, res));

// GET  /area      — Get sightings within a bounding box
sightingRoutes.get('/area', authMiddleware, (req, res) => controller.getInArea(req, res));

// GET  /cat/:catId — Get sightings for a specific cat
sightingRoutes.get('/cat/:catId', authMiddleware, (req, res) => controller.getByCat(req, res));
