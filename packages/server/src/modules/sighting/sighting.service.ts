import { PrismaClient } from '@prisma/client';
import { fuzzCoordinates } from './gps-fuzz';
import { AlertsService } from '../alerts/alerts.service';

export interface SightingRecord {
  id: string;
  catId: string;
  reporterId: string;
  timestamp: Date;
  fuzzedLat: number;
  fuzzedLng: number;
  photoUrl: string;
  type: string;
}

export class SightingService {
  private prisma: PrismaClient;
  private alertsService: AlertsService | null;

  constructor(prisma?: PrismaClient, alertsService?: AlertsService) {
    this.prisma = prisma ?? new PrismaClient();
    this.alertsService = alertsService ?? null;
  }

  /**
   * Append a new sighting for a cat.
   * - Fuzzes raw GPS coordinates before storing (Req 5.1, 5.2)
   * - If fuzz fails, stores null location (fuzzedLat=0, fuzzedLng=0) per Req 5.4
   * - Updates Cat.lastKnownApproxLocation with fuzzed coords (Req 5.5)
   * - Notifies all Lvl1+ owners of the cat (Req 12.4)
   */
  async appendSighting(
    catId: string,
    reporterId: string,
    rawGPS: { lat: number; lng: number },
    photoUrl: string,
    type: 'scan' | 'manual',
  ): Promise<SightingRecord> {
    // Apply GPS fuzzing to protect colony locations
    const fuzzed = fuzzCoordinates(rawGPS.lat, rawGPS.lng);

    // Per Req 5.4: if fuzzing fails (returns null), store 0 rather than raw coords
    const fuzzedLat = fuzzed.fuzzedLat ?? 0;
    const fuzzedLng = fuzzed.fuzzedLng ?? 0;

    // Create the sighting record with fuzzed coordinates
    const sighting = await this.prisma.sighting.create({
      data: {
        catId,
        reporterId,
        fuzzedLat,
        fuzzedLng,
        photoUrl,
        type,
      },
    });

    // Update cat's last known approximate location with fuzzed coords (Req 5.5).
    // Req 5.7: ONLY registered scan sightings may move a cat's location —
    // manual reports are recorded but never update lastKnownApproxLocation.
    if (type === 'scan' && fuzzed.fuzzedLat !== null && fuzzed.fuzzedLng !== null) {
      await this.updateCatLastKnownLocation(catId, fuzzedLat, fuzzedLng);
    }

    // Notify all Lvl1+ owners of this cat about the new sighting (Req 12.4)
    // Notification failure must NOT block or rollback sighting creation
    await this.notifySightingToOwners(catId, reporterId);

    return {
      id: sighting.id,
      catId: sighting.catId,
      reporterId: sighting.reporterId,
      timestamp: sighting.timestamp,
      fuzzedLat: sighting.fuzzedLat,
      fuzzedLng: sighting.fuzzedLng,
      photoUrl: sighting.photoUrl,
      type: sighting.type,
    };
  }

  /**
   * Notify all Lvl1+ owners of a cat about a new sighting (Req 12.4).
   * Excludes the reporter from the notification list.
   * Swallows errors so sighting creation is never broken by notification failure.
   */
  private async notifySightingToOwners(catId: string, reporterId: string): Promise<void> {
    if (!this.alertsService) return;
    try {
      // Get all Lvl1+ owners, excluding the reporter
      const owners = await this.prisma.ownership.findMany({
        where: { catId, level: { gte: 1 }, userId: { not: reporterId } },
        select: { userId: true },
      });
      if (owners.length === 0) return;

      const cat = await this.prisma.cat.findUnique({ where: { id: catId }, select: { name: true } });
      const catName = cat?.name ?? 'a cat';

      const userIds = owners.map((o) => o.userId);
      await this.alertsService.notifyMany(userIds, 'New Sighting', `A new sighting of ${catName} was reported!`, { data: { catId } });
    } catch {
      // Notification failure should not break sighting creation
    }
  }

  /**
   * Update a cat's last known approximate location using fuzzed GPS coordinates.
   */
  async updateCatLastKnownLocation(catId: string, fuzzedLat: number, fuzzedLng: number): Promise<void> {
    await this.prisma.cat.update({
      where: { id: catId },
      data: {
        lastKnownApproxLat: fuzzedLat,
        lastKnownApproxLng: fuzzedLng,
      },
    });
  }

  async getSightingsInArea(neLat: number, neLng: number, swLat: number, swLng: number): Promise<SightingRecord[]> {
    const sightings = await this.prisma.sighting.findMany({
      where: {
        fuzzedLat: { gte: swLat, lte: neLat },
        fuzzedLng: { gte: swLng, lte: neLng },
      },
      orderBy: { timestamp: 'desc' },
    });

    return sightings.map((s) => ({
      id: s.id,
      catId: s.catId,
      reporterId: s.reporterId,
      timestamp: s.timestamp,
      fuzzedLat: s.fuzzedLat,
      fuzzedLng: s.fuzzedLng,
      photoUrl: s.photoUrl,
      type: s.type,
    }));
  }

  async getCatSightings(catId: string, limit: number = 20): Promise<SightingRecord[]> {
    const sightings = await this.prisma.sighting.findMany({
      where: { catId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return sightings.map((s) => ({
      id: s.id,
      catId: s.catId,
      reporterId: s.reporterId,
      timestamp: s.timestamp,
      fuzzedLat: s.fuzzedLat,
      fuzzedLng: s.fuzzedLng,
      photoUrl: s.photoUrl,
      type: s.type,
    }));
  }

  /**
   * Get map pins for all cats, filtered by the user's discovery set.
   * - Discovered cats: full pin data (catId, name, photoUrl, approxLat, approxLng, discovered: true)
   * - Undiscovered cats: silhouette only (catId, approxLat, approxLng, discovered: false)
   * Optionally filters by bounding box on lastKnownApproxLat/Lng.
   * Implements Requirements 2.1, 2.2, 2.3, 2.4
   */
  async getMapPins(
    userId: string,
    bounds?: { neLat: number; neLng: number; swLat: number; swLng: number },
  ): Promise<CatMapPin[]> {
    const whereClause: any = {};

    if (bounds) {
      whereClause.lastKnownApproxLat = { gte: bounds.swLat, lte: bounds.neLat };
      whereClause.lastKnownApproxLng = { gte: bounds.swLng, lte: bounds.neLng };
    }

    const cats = await this.prisma.cat.findMany({
      where: whereClause,
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
      },
    });

    return cats.map((cat) => {
      const discovered = cat.discoveries.length > 0;

      if (discovered) {
        return {
          catId: cat.id,
          name: cat.name,
          photoUrl: cat.photoUrl,
          approxLat: cat.lastKnownApproxLat,
          approxLng: cat.lastKnownApproxLng,
          discovered: true as const,
        };
      } else {
        return {
          catId: cat.id,
          approxLat: cat.lastKnownApproxLat,
          approxLng: cat.lastKnownApproxLng,
          discovered: false as const,
        };
      }
    });
  }
}

/** Map pin for a cat the user has discovered */
export interface DiscoveredMapPin {
  catId: string;
  name: string | null;
  photoUrl: string | null;
  approxLat: number;
  approxLng: number;
  discovered: true;
}

/** Map pin for a cat the user has NOT discovered (silhouette only) */
export interface UndiscoveredMapPin {
  catId: string;
  approxLat: number;
  approxLng: number;
  discovered: false;
}

export type CatMapPin = DiscoveredMapPin | UndiscoveredMapPin;
