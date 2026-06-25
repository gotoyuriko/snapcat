import { Request, Response } from 'express';

/**
 * TODO: Implement RecognitionController
 * - Accept image upload (multipart/form-data)
 * - Delegate to RecognitionService
 * - Return RecognitionResult to client
 */

export class RecognitionController {
  async recognize(_req: Request, res: Response): Promise<void> {
    // TODO: Extract image from request, call service
    res.status(501).json({ error: 'Not implemented' });
  }
}
