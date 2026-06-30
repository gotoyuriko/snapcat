import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { SightingService } from '../sighting/sighting.service';

const prisma = new PrismaClient();
const sightingService = new SightingService();

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
}
