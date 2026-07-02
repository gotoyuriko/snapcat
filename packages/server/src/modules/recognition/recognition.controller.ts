import { Request, Response } from 'express';
import { z } from 'zod';
import { RecognitionService, RawGPS } from './recognition.service';
import { PrismaClient } from '@prisma/client';
import { YoloClient } from './yolo.client';
import { MegaDescriptorClient } from './megadescriptor.client';
import { VectorService } from './vector.service';
import { PhotoStorageService } from './photo-storage.service';

const gpsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const confirmSchema = z.object({
  catId: z.string().min(1),
  embedding: z.array(z.number()),
  userGPS: gpsSchema,
  photoUrl: z.string().optional().default(''),
});

/**
 * RecognitionController — handles HTTP requests for cat scanning endpoints.
 */
export class RecognitionController {
  private readonly recognitionService: RecognitionService;
  private readonly photoStorageService: PhotoStorageService;

  constructor(recognitionService?: RecognitionService, photoStorageService?: PhotoStorageService) {
    this.photoStorageService = photoStorageService ?? new PhotoStorageService();
    if (recognitionService) {
      this.recognitionService = recognitionService;
    } else {
      const prisma = new PrismaClient();
      const yoloClient = new YoloClient();
      const megaDescriptorClient = new MegaDescriptorClient();
      const vectorService = new VectorService(prisma);
      this.recognitionService = new RecognitionService(
        yoloClient,
        megaDescriptorClient,
        vectorService,
        prisma,
      );
    }
  }

  /**
   * POST /scan — Upload a photo for cat recognition.
   * Expects multipart/form-data with a 'photo' file field and 'userGPS' JSON field.
   */
  async scan(req: Request, res: Response): Promise<void> {
    try {
      // Validate file upload
      if (!req.file) {
        res.status(400).json({ error: 'Photo file is required' });
        return;
      }

      // Parse GPS from body (sent as JSON string in multipart form)
      let userGPS: RawGPS;
      try {
        const gpsRaw = typeof req.body.userGPS === 'string'
          ? JSON.parse(req.body.userGPS)
          : req.body.userGPS;
        const parsed = gpsSchema.safeParse(gpsRaw);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid GPS data', details: parsed.error.flatten() });
          return;
        }
        userGPS = parsed.data;
      } catch {
        res.status(400).json({ error: 'Invalid userGPS JSON' });
        return;
      }

      const userId = req.user!.userId;
      const photo = req.file.buffer;

      const storedFileName = await this.photoStorageService.storePhoto(photo);
      const photoUrl = this.photoStorageService.buildUrl(req, storedFileName);

      const result = await this.recognitionService.recognizeCat(photo, userGPS, userId, photoUrl);

      // Map result to appropriate HTTP status
      if (result.result === 'no_cat') {
        res.status(422).json({ result: 'no_cat', message: 'No cat detected — please retake' });
        return;
      }

      if (result.result === 'new_cat') {
        res.status(201).json(result);
        return;
      }

      // 'matched' or 'confirm_needed'
      res.status(200).json(result);
    } catch (err: any) {
      this.handleServiceError(err, res);
    }
  }

  /**
   * POST /scan/confirm — Confirm a borderline match or register a new cat.
   * Expects JSON body with catId, embedding, userGPS, and optional photoUrl.
   */
  async confirm(req: Request, res: Response): Promise<void> {
    try {
      const parsed = confirmSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
        return;
      }

      const { catId, embedding, userGPS, photoUrl } = parsed.data;
      const userId = req.user!.userId;

      const result = await this.recognitionService.confirmMatch(
        userId,
        catId,
        embedding,
        userGPS,
        photoUrl,
      );

      if (result.result === 'new_cat') {
        res.status(201).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (err: any) {
      this.handleServiceError(err, res);
    }
  }

  /**
   * Map service errors to appropriate HTTP status codes.
   */
  private handleServiceError(err: any, res: Response): void {
    const message = err?.message ?? 'Internal server error';

    // AI service errors → 503
    if (
      message.includes('unavailable') ||
      message.includes('YOLO') ||
      message.includes('MegaDescriptor')
    ) {
      res.status(503).json({ error: 'AI service temporarily unavailable', detail: message });
      return;
    }

    // Generic internal error
    console.error('Recognition request failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
