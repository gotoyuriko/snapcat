import * as fc from 'fast-check';
import { Request, Response, NextFunction } from 'express';

/**
 * Property 7: Ownership gates medical access
 * **Validates: Requirements 9.1, 9.2**
 *
 * For any MedicalRequest submission, the request is accepted if and only if
 * the requester has Ownership.level >= 7 for the cat; all others return 403.
 */

// --- Mock Prisma at module level before importing ownershipGate ---
const mockFindUnique = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    ownership: {
      findUnique: mockFindUnique,
    },
  })),
}));

// Import after mock setup
import { ownershipGate } from '../../../middleware/ownershipGate';

// --- Arbitraries ---
const uuidArb = fc.uuid();
const medicalTypeArb = fc.oneof(fc.constant('medical'), fc.constant('grooming'));

// --- Mock Express request/response factory ---
function createMockReq(userId: string, catId: string): Partial<Request> {
  return {
    user: { userId } as any,
    params: {},
    body: { catId },
  };
}

function createMockRes() {
  let _statusCode: number | null = null;
  let _jsonBody: any = null;

  const res: Partial<Response> = {
    status: jest.fn().mockImplementation(function (this: any, code: number) {
      _statusCode = code;
      return res;
    }),
    json: jest.fn().mockImplementation(function (this: any, body: any) {
      _jsonBody = body;
      return res;
    }),
  };

  return {
    res,
    getStatusCode: () => _statusCode,
    getJsonBody: () => _jsonBody,
  };
}

describe('Medical Ownership Gate — Property Tests', () => {
  afterEach(() => {
    mockFindUnique.mockReset();
  });

  /**
   * **Validates: Requirements 9.1**
   *
   * Property: For any (userId, catId, type) where the user has Ownership.level >= 7,
   * the ownershipGate(7) middleware calls next() (request accepted).
   */
  it('accepts medical request when user has Ownership.level >= 7', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        medicalTypeArb,
        fc.integer({ min: 7, max: 10 }),
        async (userId, catId, _type, level) => {
          // Configure mock to return ownership at this level
          mockFindUnique.mockResolvedValue({
            userId,
            catId,
            level,
            xp: 0,
          });

          const req = createMockReq(userId, catId);
          const mock = createMockRes();
          const next: NextFunction = jest.fn();

          const middleware = ownershipGate(7);
          await middleware(req as Request, mock.res as Response, next);

          // Should call next() — request accepted
          expect(next).toHaveBeenCalled();
          // Should NOT have sent a 403
          expect(mock.getStatusCode()).toBeNull();

          mockFindUnique.mockReset();
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * **Validates: Requirements 9.2**
   *
   * Property: For any (userId, catId) where the user has Ownership.level < 7
   * (level 0–6 or no ownership record), the ownershipGate(7) middleware returns 403.
   */
  it('rejects medical request with 403 when user has Ownership.level < 7 or no ownership', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        medicalTypeArb,
        fc.oneof(
          fc.integer({ min: 0, max: 6 }),
          fc.constant(null),
        ),
        async (userId, catId, _type, level) => {
          // Configure mock: null means no record, 0-6 means insufficient level
          if (level === null) {
            mockFindUnique.mockResolvedValue(null);
          } else {
            mockFindUnique.mockResolvedValue({
              userId,
              catId,
              level,
              xp: 0,
            });
          }

          const req = createMockReq(userId, catId);
          const mock = createMockRes();
          const next: NextFunction = jest.fn();

          const middleware = ownershipGate(7);
          await middleware(req as Request, mock.res as Response, next);

          // Should NOT call next()
          expect(next).not.toHaveBeenCalled();
          // Should return 403
          expect(mock.getStatusCode()).toBe(403);
          // Should include error details
          expect(mock.getJsonBody()).toEqual({
            error: 'Insufficient ownership level',
            required: 7,
            current: level,
          });

          mockFindUnique.mockReset();
        },
      ),
      { numRuns: 30 },
    );
  });
});
