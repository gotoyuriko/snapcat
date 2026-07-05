import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { SightingService } from '../sighting/sighting.service';
import { validateCatName } from './cat-name.moderation';

const prisma = new PrismaClient();
const sightingService = new SightingService();

// Length and content rules are enforced by validateCatName (Req 19.2–19.5);
// this schema only ensures a string was submitted.
const renameSchema = z.object({
  name: z.string(),
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
        // Req 19.7: only the first discoverer may name/rename the cat — the
        // client uses this to show or hide the name edit control.
        isFirstDiscoverer: cat.firstDiscovererId === userId,
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
   * PATCH /api/cats/:catId — set or rename a cat's name.
   * Requirement 19.7: only the first discoverer may name the cat (at initial
   * registration) or rename it later; everyone else gets 403.
   * Requirement 19.1–19.6: the name passes content moderation before being
   * stored — invalid names are rejected and never persisted.
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

      const existing = await prisma.cat.findUnique({ where: { id: catId } });
      if (!existing) {
        res.status(404).json({ error: 'Cat not found' });
        return;
      }
      if (existing.firstDiscovererId !== userId) {
        res.status(403).json({ error: 'Only the first discoverer may name this cat' });
        return;
      }

      const validation = validateCatName(parsed.data.name);
      if (!validation.valid) {
        res.status(400).json({ error: validation.reason });
        return;
      }

      const cat = await prisma.cat.update({
        where: { id: catId },
        data: { name: validation.name },
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
