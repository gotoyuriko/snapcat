import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { ChatController } from './chat.controller';

/**
 * Chat Routes — REST fallback endpoints for cat community chat.
 * Task 9.2: POST /:catId/messages and GET /:catId/messages
 *
 * Both routes are protected by auth middleware.
 * Ownership check (Lvl1+) is handled in the controller/service layer.
 */

const controller = new ChatController();

export const chatRoutes = Router();

// POST /api/cats/:catId/messages — Send a message
chatRoutes.post(
  '/:catId/messages',
  authMiddleware,
  (req, res) => controller.sendMessage(req, res),
);

// GET /api/cats/:catId/messages — Get message history
chatRoutes.get(
  '/:catId/messages',
  authMiddleware,
  (req, res) => controller.getMessages(req, res),
);

// POST /api/cats/:catId/photos — upload a chat image (Req 8.5).
// Lvl1+ ownership is checked in the controller; the stored photo is served
// from the public cat-photo route, same as scan photos.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
chatRoutes.post(
  '/:catId/photos',
  authMiddleware,
  upload.single('photo'),
  (req, res) => controller.uploadPhoto(req, res),
);
