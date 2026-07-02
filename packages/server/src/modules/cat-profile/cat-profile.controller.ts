import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { SightingService } from '../sighting/sighting.service';

const prisma = new PrismaClient();
const sightingService = new SightingService();

const renameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name must be 50 characters or fewer'),
});

// Mirrors the client's XP thresholds (CatProfileScreen LEVEL_THRESHOLDS).
const LEVEL_THRESHOLDS = [0, 1, 6, 16, 31, 56, 96, 156, 236, 336, 486];
function nextLevelXp(level: number): number {
  return LEVEL_THRESHOLDS[Math.min(Math.max(level, 0) + 1, 10)];
}

/**
 * GET /api/cats/:catId — aggregated cat profile for CatProfileScreen:
 * cat info, the requesting user's ownership/discovery, recent sightings, and a
 * short chat teaser.
 */
export class CatProfileController {
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const { catId } = req.params;
      const userId = req.user!.userId;

      const cat = await prisma.cat.findUnique({ where: { id: catId } });
      if (!cat) {
        res.status(404).json({ error: 'Cat not found' });
        return;
      }

      const [ownership, discovery, sightings, chatMsgs] = await Promise.all([
        prisma.ownership.findUnique({ where: { userId_catId: { userId, catId } } }),
        prisma.userCatDiscovery.findUnique({ where: { userId_catId: { userId, catId } } }),
        sightingService.getCatSightings(catId, 20),
        prisma.chatMessage.findMany({
          where: { catId },
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: { sender: { select: { displayName: true } } },
        }),
      ]);

      res.status(200).json({
        cat: {
          id: cat.id,
          name: cat.name,
          photoUrl: cat.photoUrl,
          description: null, // Cat model has no description field yet.
          lastKnownApproxLat: cat.lastKnownApproxLat,
          lastKnownApproxLng: cat.lastKnownApproxLng,
          registeredAt: cat.registeredAt.toISOString(),
        },
        ownership: ownership
          ? { level: ownership.level, xp: ownership.xp, nextLevelXp: nextLevelXp(ownership.level) }
          : null,
        discovered: discovery !== null,
        sightings: sightings.map((s) => ({
          id: s.id,
          timestamp: s.timestamp.toISOString(),
          fuzzedLat: s.fuzzedLat,
          fuzzedLng: s.fuzzedLng,
          photoUrl: s.photoUrl,
          type: s.type,
        })),
        chatTeaser: chatMsgs.map((m) => ({
          content: m.content,
          senderName: m.sender.displayName,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      console.error('Cat profile error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * PATCH /api/cats/:catId — rename a cat. Any user who has discovered the
   * cat may rename it (same gate as "Feed Cat": Lvl0+ discovered, Req 14.4);
   * naming isn't tied to Ownership, which only exists once a user has fed
   * the cat at least once.
   */
  async updateName(req: Request, res: Response): Promise<void> {
    try {
      const { catId } = req.params;
      const userId = req.user!.userId;

      const parsed = renameSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
        return;
      }

      const discovery = await prisma.userCatDiscovery.findUnique({
        where: { userId_catId: { userId, catId } },
      });
      if (!discovery) {
        res.status(403).json({ error: 'You must discover this cat before naming it' });
        return;
      }

      const cat = await prisma.cat.update({
        where: { id: catId },
        data: { name: parsed.data.name },
      });

      res.status(200).json({ id: cat.id, name: cat.name });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        res.status(404).json({ error: 'Cat not found' });
        return;
      }
      console.error('Cat rename error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
