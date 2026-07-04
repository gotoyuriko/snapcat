import { Request, Response } from 'express';
import { z } from 'zod';
import { ChatService, ForbiddenError } from './chat.service';
import { broadcastChatMessage } from './chat.gateway';

const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
  // Optional photo attachment: host-less path under our own photo route only,
  // so arbitrary external URLs can't be injected into chat.
  photoUrl: z
    .string()
    .max(500)
    .regex(/^\/api\/recognition\/photos\//)
    .optional(),
});

const getMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.string().datetime().optional(),
});

/**
 * Chat Controller — REST fallback endpoints for cat community chat.
 * Task 9.2: POST /cats/:catId/messages and GET /cats/:catId/messages
 *
 * Requirements:
 * - 8.1: Lvl1+ owners can read/send messages
 * - 8.2: Non-owners get 403 rejection
 * - 8.3: Persist message before any response
 */
export class ChatController {
  private chatService: ChatService;

  constructor() {
    this.chatService = new ChatService();
  }

  /**
   * POST /cats/:catId/messages
   * Send a message in a cat's community chat.
   */
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { catId } = req.params;
      if (!catId) {
        res.status(400).json({ error: 'Missing catId parameter' });
        return;
      }

      const parseResult = sendMessageSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Invalid request body', details: parseResult.error.issues });
        return;
      }

      const { content, photoUrl } = parseResult.data;
      const message = await this.chatService.sendMessage(catId, userId, content, photoUrl);

      // Persisted — now let online room members see it in real time (Req 8.3),
      // matching the socket send path.
      broadcastChatMessage(catId, message);

      res.status(201).json(message);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  /**
   * GET /cats/:catId/messages
   * Get message history for a cat's community chat.
   */
  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { catId } = req.params;
      if (!catId) {
        res.status(400).json({ error: 'Missing catId parameter' });
        return;
      }

      const parseResult = getMessagesQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.issues });
        return;
      }

      const { limit, before } = parseResult.data;
      const beforeDate = before ? new Date(before) : undefined;

      const messages = await this.chatService.getMessages(catId, userId, limit, beforeDate);

      res.status(200).json(messages);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        res.status(403).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }
}
