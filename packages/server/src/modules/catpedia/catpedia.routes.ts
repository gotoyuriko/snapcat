import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { CatpediaController } from './catpedia.controller';

const controller = new CatpediaController();

export const catpediaRoutes = Router();

// GET /api/catpedia?filter=all|discovered|owned
// Returns catpedia entries filtered by discovery/ownership state for the requesting user.
// Undiscovered cats: silhouette only (no name, no photo).
// Implements Requirements 7.1, 7.2, 7.3, 7.4, 7.5
catpediaRoutes.get('/', authMiddleware, (req, res) => controller.getAll(req, res));
