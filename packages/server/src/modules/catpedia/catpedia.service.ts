import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type CatpediaFilter = 'all' | 'discovered' | 'owned';

/** A cat that the user has discovered (or owns) — full details visible */
export interface DiscoveredCatpediaEntry {
  id: string;
  name: string | null;
  photoUrl: string | null;
  level: number;
  xp: number;
  approxLat: number;
  approxLng: number;
  discovered: true;
  owned: boolean;
}

/** A cat that the user has NOT discovered — silhouette only, no name/photo */
export interface UndiscoveredCatpediaEntry {
  id: string;
  approxLat: number;
  approxLng: number;
  discovered: false;
}

export type CatpediaEntry = DiscoveredCatpediaEntry | UndiscoveredCatpediaEntry;

export class CatpediaService {
  /**
   * Get catpedia entries for the given user, filtered by discovery/ownership state.
   *
   * Filter modes:
   * - "all": all registered cats (undiscovered shown as silhouettes)
   * - "discovered": only cats the user discovered but does NOT own (Lvl0 stray)
   * - "owned": only cats the user owns (Lvl1+ ownership)
   *
   * Requirements: 7.1, 7.2, 7.3, 7.4
   */
  async getCats(userId: string, filter: CatpediaFilter): Promise<CatpediaEntry[]> {
    const cats = await prisma.cat.findMany({
      select: {
        id: true,
        name: true,
        photoUrl: true,
        lastKnownApproxLat: true,
        lastKnownApproxLng: true,
        discoveries: {
          where: { userId },
          select: { userId: true },
        },
        ownerships: {
          where: { userId },
          select: { level: true, xp: true },
        },
      },
    });

    const entries: CatpediaEntry[] = [];

    for (const cat of cats) {
      const isDiscovered = cat.discoveries.length > 0;
      const ownership = cat.ownerships.length > 0 ? cat.ownerships[0] : null;
      const isOwned = ownership !== null && ownership.level >= 1;

      if (filter === 'discovered') {
        // Only cats discovered but NOT owned (Lvl0 stray cats)
        if (!isDiscovered || isOwned) continue;
        entries.push(this.buildDiscoveredEntry(cat, ownership));
      } else if (filter === 'owned') {
        // Only cats the user owns (Lvl1+)
        if (!isOwned) continue;
        entries.push(this.buildDiscoveredEntry(cat, ownership));
      } else {
        // "all" — show everything, but undiscovered cats get silhouette treatment
        if (isDiscovered) {
          entries.push(this.buildDiscoveredEntry(cat, ownership));
        } else {
          entries.push({
            id: cat.id,
            approxLat: cat.lastKnownApproxLat,
            approxLng: cat.lastKnownApproxLng,
            discovered: false,
          });
        }
      }
    }

    return entries;
  }

  private buildDiscoveredEntry(
    cat: {
      id: string;
      name: string | null;
      photoUrl: string | null;
      lastKnownApproxLat: number;
      lastKnownApproxLng: number;
      ownerships: { level: number; xp: number }[];
    },
    ownership: { level: number; xp: number } | null,
  ): DiscoveredCatpediaEntry {
    return {
      id: cat.id,
      name: cat.name,
      photoUrl: cat.photoUrl,
      level: ownership?.level ?? 0,
      xp: ownership?.xp ?? 0,
      approxLat: cat.lastKnownApproxLat,
      approxLng: cat.lastKnownApproxLng,
      discovered: true,
      owned: ownership !== null && ownership.level >= 1,
    };
  }
}
