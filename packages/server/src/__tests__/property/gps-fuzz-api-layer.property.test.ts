/**
 * Property 2: GPS fuzz invariant (API layer)
 *
 * **Validates: Requirements 5.5, 14.2**
 *
 * For any raw GPS input driven through the `/map`, `/catpedia`, `/cats/:id`, and
 * `/sightings` endpoints, no returned coordinate pair ever matches the raw input
 * GPS — i.e. the fuzz is ALWAYS applied at the API layer before serialisation.
 *
 * This exercises the real controllers/services (SightingController, CatpediaController,
 * CatProfileController) together with the real `gpsResponseGuard` response interceptor
 * (task 18.2). Prisma is mocked with an in-memory store so that a raw GPS coordinate
 * enters the system via `appendSighting`, is fuzzed + persisted, and is then read back
 * out through each read endpoint. We assert that the raw pair never surfaces in any
 * serialised response.
 */

import * as fc from 'fast-check';
import type { Request, Response } from 'express';

// --- In-memory store ---
interface CatRow {
  id: string;
  name: string | null;
  photoUrl: string | null;
  lastKnownApproxLat: number;
  lastKnownApproxLng: number;
  registeredAt: Date;
}

let cats: CatRow[];
let sightings: Array<{
  id: string;
  catId: string;
  reporterId: string;
  timestamp: Date;
  fuzzedLat: number;
  fuzzedLng: number;
  photoUrl: string;
  type: string;
}>;
let discoveries: Set<string>; // `${userId}:${catId}`
let ownerships: Map<string, { level: number; xp: number }>; // `${userId}:${catId}`
let seq: number;

function resetStore() {
  cats = [];
  sightings = [];
  discoveries = new Set();
  ownerships = new Map();
  seq = 0;
}

// --- Mock PrismaClient (shared instance for every `new PrismaClient()`) ---
const mockPrisma = {
  sighting: {
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: `sighting-${seq++}`,
        timestamp: new Date(),
        catId: data.catId,
        reporterId: data.reporterId,
        fuzzedLat: data.fuzzedLat,
        fuzzedLng: data.fuzzedLng,
        photoUrl: data.photoUrl ?? '',
        type: data.type,
      };
      sightings.push(row);
      return row;
    }),
    findMany: jest.fn(async ({ where, take }: any = {}) => {
      let rows = sightings;
      if (where?.catId) rows = rows.filter((s) => s.catId === where.catId);
      rows = [...rows].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      if (take) rows = rows.slice(0, take);
      return rows;
    }),
  },
  cat: {
    update: jest.fn(async ({ where, data }: any) => {
      const cat = cats.find((c) => c.id === where.id);
      if (!cat) throw Object.assign(new Error('not found'), { code: 'P2025' });
      if (data.lastKnownApproxLat !== undefined) cat.lastKnownApproxLat = data.lastKnownApproxLat;
      if (data.lastKnownApproxLng !== undefined) cat.lastKnownApproxLng = data.lastKnownApproxLng;
      if (data.name !== undefined) cat.name = data.name;
      return cat;
    }),
    findUnique: jest.fn(async ({ where }: any) => cats.find((c) => c.id === where.id) ?? null),
    findMany: jest.fn(async ({ where, select }: any = {}) => {
      // The userId used to resolve per-user relations is nested inside the
      // `discoveries` relation filter (see map/catpedia services).
      const userId: string | undefined = select?.discoveries?.where?.userId;

      let rows = cats;
      if (where?.lastKnownApproxLat) {
        const { gte, lte } = where.lastKnownApproxLat;
        rows = rows.filter((c) => c.lastKnownApproxLat >= gte && c.lastKnownApproxLat <= lte);
      }
      if (where?.lastKnownApproxLng) {
        const { gte, lte } = where.lastKnownApproxLng;
        rows = rows.filter((c) => c.lastKnownApproxLng >= gte && c.lastKnownApproxLng <= lte);
      }

      return rows.map((c) => {
        const key = `${userId}:${c.id}`;
        const owner = ownerships.get(key);
        return {
          id: c.id,
          name: c.name,
          photoUrl: c.photoUrl,
          lastKnownApproxLat: c.lastKnownApproxLat,
          lastKnownApproxLng: c.lastKnownApproxLng,
          discoveries: discoveries.has(key) ? [{ userId }] : [],
          ownerships: owner ? [{ level: owner.level, xp: owner.xp }] : [],
        };
      });
    }),
  },
  ownership: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async ({ where }: any) => {
      const { userId, catId } = where.userId_catId;
      const o = ownerships.get(`${userId}:${catId}`);
      return o ? { userId, catId, level: o.level, xp: o.xp } : null;
    }),
  },
  userCatDiscovery: {
    findUnique: jest.fn(async ({ where }: any) => {
      const { userId, catId } = where.userId_catId;
      return discoveries.has(`${userId}:${catId}`) ? { userId, catId } : null;
    }),
  },
  chatMessage: {
    findMany: jest.fn(async () => []),
  },
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

// Import after the mock is registered.
import { gpsResponseGuard } from '../../middleware/gpsResponseGuard';
import { SightingService } from '../../modules/sighting/sighting.service';
import { SightingController } from '../../modules/sighting/sighting.controller';
import { CatpediaController } from '../../modules/catpedia/catpedia.controller';
import { CatProfileController } from '../../modules/cat-profile/cat-profile.controller';

// A fixed UUID so the sighting-report zod schema (uuid) passes validation.
const CAT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'user-under-test';

/**
 * Runs an endpoint handler exactly like Express would once `gpsResponseGuard`
 * is mounted: the guard wraps `res.json`, then the handler executes and we
 * capture the (already-sanitised) serialised body.
 */
async function runThroughApiLayer(
  req: Partial<Request>,
  handler: (req: Request, res: Response) => Promise<void>,
): Promise<{ statusCode: number; body: any }> {
  let captured: any;
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      captured = body;
      return this;
    },
  };
  gpsResponseGuard(req as Request, res as Response, () => undefined);
  await handler(req as Request, res as Response);
  return { statusCode: res.statusCode, body: captured };
}

/**
 * Recursively extract every (lat, lng) coordinate pair present in a serialised
 * response. A pair is formed from any object that carries both a lat-like and a
 * lng-like numeric field.
 */
function collectCoordinatePairs(value: unknown): Array<{ lat: number; lng: number }> {
  const pairs: Array<{ lat: number; lng: number }> = [];

  function walk(v: unknown): void {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      let lat: number | undefined;
      let lng: number | undefined;
      for (const [k, val] of Object.entries(obj)) {
        if (typeof val !== 'number') continue;
        const key = k.toLowerCase();
        if (key.includes('lat')) lat = val;
        else if (key.includes('lng') || key.includes('lon')) lng = val;
      }
      if (lat !== undefined && lng !== undefined) pairs.push({ lat, lng });
      for (const val of Object.values(obj)) walk(val);
    }
  }

  walk(value);
  return pairs;
}

describe('GPS Fuzz Invariant at the API layer — Property Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property 2: GPS fuzz invariant (API layer)
   *
   * **Validates: Requirements 5.5, 14.2**
   *
   * For any raw GPS input, once it is driven through the system, none of the
   * `/map`, `/catpedia`, `/cats/:id`, or `/sightings` responses ever echoes the
   * raw coordinate pair — the fuzz is always applied before serialisation.
   */
  it('never returns the raw input GPS coordinate pair from /map, /catpedia, /cats/:id, or /sightings', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Realistic raw GPS coordinates (avoid the poles where lng scaling degenerates).
        fc.double({ min: -85, max: 85, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }),
        // Whether the requesting user has discovered / owns the cat — exercises
        // both the "full pin" and "silhouette" serialisation branches.
        fc.boolean(),
        fc.boolean(),
        async (rawLat, rawLng, discovered, owned) => {
          resetStore();

          // Seed a single cat with a placeholder location.
          cats.push({
            id: CAT_ID,
            name: 'Whiskers',
            photoUrl: 'https://example.com/whiskers.jpg',
            lastKnownApproxLat: 0,
            lastKnownApproxLng: 0,
            registeredAt: new Date('2024-01-01T00:00:00.000Z'),
          });
          if (discovered) discoveries.add(`${USER_ID}:${CAT_ID}`);
          if (discovered && owned) ownerships.set(`${USER_ID}:${CAT_ID}`, { level: 3, xp: 42 });

          const sightingService = new SightingService(mockPrisma as any);

          // 1) A raw GPS coordinate enters via a scan sighting → fuzzed + persisted,
          //    and the cat's lastKnownApproxLocation is updated with fuzzed coords.
          await sightingService.appendSighting(
            CAT_ID,
            USER_ID,
            { lat: rawLat, lng: rawLng },
            'https://example.com/scan.jpg',
            'scan',
          );

          const sightingController = new SightingController(sightingService);
          const catpediaController = new CatpediaController();
          const catProfileController = new CatProfileController();

          const raw = { lat: rawLat, lng: rawLng };
          const responses: Array<{ label: string; res: { statusCode: number; body: any } }> = [];

          // /sightings — POST report drives a fresh raw GPS straight into the response.
          responses.push({
            label: 'POST /sightings',
            res: await runThroughApiLayer(
              {
                user: { userId: USER_ID } as any,
                body: { catId: CAT_ID, lat: rawLat, lng: rawLng, photoUrl: 'https://example.com/report.jpg' },
              },
              (req, res) => sightingController.report(req, res),
            ),
          });

          // /map
          responses.push({
            label: 'GET /map',
            res: await runThroughApiLayer(
              { user: { userId: USER_ID } as any, query: {} },
              (req, res) => sightingController.getMapPins(req, res),
            ),
          });

          // /catpedia
          responses.push({
            label: 'GET /catpedia',
            res: await runThroughApiLayer(
              { user: { userId: USER_ID } as any, query: {} },
              (req, res) => catpediaController.getAll(req, res),
            ),
          });

          // /cats/:id
          responses.push({
            label: 'GET /cats/:id',
            res: await runThroughApiLayer(
              { user: { userId: USER_ID } as any, params: { catId: CAT_ID } as any },
              (req, res) => catProfileController.getProfile(req, res),
            ),
          });

          let totalPairs = 0;
          for (const { label, res } of responses) {
            expect(res.statusCode).toBeLessThan(400);

            const pairs = collectCoordinatePairs(res.body);
            totalPairs += pairs.length;

            for (const pair of pairs) {
              // INVARIANT: no serialised coordinate pair equals the raw input GPS.
              const matchesRaw = pair.lat === raw.lat && pair.lng === raw.lng;
              expect(matchesRaw).toBe(false);
            }
          }

          // Non-vacuous: at least one coordinate pair must have been serialised
          // across the four endpoints (otherwise the invariant would be trivial).
          expect(totalPairs).toBeGreaterThan(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});
