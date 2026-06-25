import { Request, Response } from 'express';

/**
 * TODO: Implement ChatController
 * - REST endpoint for message history (fallback if socket unavailable)
 * - Delegate to ChatService
 */

export class ChatController {
  async getMessages(_req: Request, res: Response): Promise<void> {
    // TODO: Get chat history for a cat
    res.status(501).json({ error: 'Not implemented' });
  }
}
