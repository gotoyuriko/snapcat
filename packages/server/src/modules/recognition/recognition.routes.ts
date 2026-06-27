import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth';
import { RecognitionController } from './recognition.controller';

// Configure multer for in-memory file storage (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
  fileFilter: (_req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

const controller = new RecognitionController();

export const recognitionRoutes = Router();

/**
 * POST /scan — Upload a cat photo for recognition.
 * Requires auth. Multipart/form-data with 'photo' file and 'userGPS' JSON.
 */
recognitionRoutes.post(
  '/scan',
  authMiddleware,
  upload.single('photo'),
  (req, res) => controller.scan(req, res),
);

/**
 * POST /scan/confirm — Confirm a borderline match or register a new cat.
 * Requires auth. JSON body with catId, embedding, userGPS, photoUrl.
 */
recognitionRoutes.post(
  '/scan/confirm',
  authMiddleware,
  (req, res) => controller.confirm(req, res),
);
