/**
 * Requirement 19.6, 19.7 — naming/renaming is restricted to the first
 * discoverer, moderated names are rejected before storage, and staff can
 * override reported names (19.8).
 */
import { Request, Response } from 'express';

// Mock Prisma at module level (shared by both controllers under test)
const mockCatFindUnique = jest.fn();
const mockCatUpdate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    cat: {
      findUnique: mockCatFindUnique,
      update: mockCatUpdate,
    },
    userCatDiscovery: { findUnique: jest.fn() },
    sighting: { findMany: jest.fn() },
    ownership: { findUnique: jest.fn() },
    chatMessage: { findMany: jest.fn() },
  })),
}));

import { CatProfileController } from '../cat-profile.controller';
import { StaffVerificationController } from '../../staff-verification/staff-verification.controller';

function createMockReq(overrides: Record<string, any> = {}): Partial<Request> {
  return {
    user: { userId: 'discoverer-1', email: 'test@example.com' },
    params: { catId: 'cat-1' },
    body: {},
    ...overrides,
  };
}

function createMockRes(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = { statusCode: 0, body: null };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((data: any) => { res.body = data; return res; });
  return res;
}

const CAT = { id: 'cat-1', firstDiscovererId: 'discoverer-1', name: null };

describe('PATCH /api/cats/:catId — updateName (Req 19.6, 19.7)', () => {
  let controller: CatProfileController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CatProfileController();
    mockCatFindUnique.mockResolvedValue({ ...CAT });
    mockCatUpdate.mockImplementation(async ({ data }: any) => ({ ...CAT, name: data.name }));
  });

  it('lets the first discoverer set a valid name', async () => {
    const req = createMockReq({ body: { name: 'Whiskers' } });
    const res = createMockRes();

    await controller.updateName(req as Request, res as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Whiskers');
    expect(mockCatUpdate).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { name: 'Whiskers' },
    });
  });

  it('rejects a non-first-discoverer with 403 and stores nothing (Req 19.7)', async () => {
    const req = createMockReq({
      user: { userId: 'someone-else', email: 'other@example.com' },
      body: { name: 'Whiskers' },
    });
    const res = createMockRes();

    await controller.updateName(req as Request, res as Response);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toContain('first discoverer');
    expect(mockCatUpdate).not.toHaveBeenCalled();
  });

  it('rejects an inappropriate name with 400 and never stores it (Req 19.2, 19.6)', async () => {
    const req = createMockReq({ body: { name: 'Sh1tface' } });
    const res = createMockRes();

    await controller.updateName(req as Request, res as Response);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('appropriate');
    expect(mockCatUpdate).not.toHaveBeenCalled();
  });

  it('rejects an out-of-length name with 400 (Req 19.4)', async () => {
    const req = createMockReq({ body: { name: 'A' } });
    const res = createMockRes();

    await controller.updateName(req as Request, res as Response);

    expect(res.statusCode).toBe(400);
    expect(mockCatUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown cat', async () => {
    mockCatFindUnique.mockResolvedValue(null);
    const req = createMockReq({ body: { name: 'Whiskers' } });
    const res = createMockRes();

    await controller.updateName(req as Request, res as Response);

    expect(res.statusCode).toBe(404);
  });
});

describe('PATCH /api/staff/cats/:catId/name — staff override (Req 19.8)', () => {
  let controller: StaffVerificationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new StaffVerificationController();
    mockCatUpdate.mockImplementation(async ({ data }: any) => ({ ...CAT, name: data.name }));
  });

  it('staff can rename any cat with a valid name', async () => {
    const req = createMockReq({ body: { name: 'Kunyit' } });
    const res = createMockRes();

    await controller.renameCat(req as Request, res as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Kunyit');
  });

  it('the staff replacement name passes the same moderation', async () => {
    const req = createMockReq({ body: { name: 'Pukimak' } });
    const res = createMockRes();

    await controller.renameCat(req as Request, res as Response);

    expect(res.statusCode).toBe(400);
    expect(mockCatUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the cat does not exist', async () => {
    mockCatUpdate.mockRejectedValue({ code: 'P2025' });
    const req = createMockReq({ body: { name: 'Kunyit' } });
    const res = createMockRes();

    await controller.renameCat(req as Request, res as Response);

    expect(res.statusCode).toBe(404);
  });
});
