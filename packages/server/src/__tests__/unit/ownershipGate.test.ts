import { Request, Response, NextFunction } from 'express';
import { ownershipGate } from '../../middleware/ownershipGate';

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockFindUnique = jest.fn();
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      ownership: {
        findUnique: mockFindUnique,
      },
    })),
    __mockFindUnique: mockFindUnique,
  };
});

const { __mockFindUnique: mockFindUnique } = jest.requireMock('@prisma/client');

function createMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: { userId: 'user-1', email: 'test@example.com' },
    params: {} as any,
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

describe('ownershipGate middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    next = jest.fn();
  });

  it('returns 401 if user is not authenticated', async () => {
    const req = createMockReq({ user: undefined });
    const res = createMockRes();

    const middleware = ownershipGate(1);
    await middleware(req as Request, res as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Authentication required');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 if catId is not provided', async () => {
    const req = createMockReq({ params: {} as any, body: {} });
    const res = createMockRes();

    const middleware = ownershipGate(1);
    await middleware(req as Request, res as Response, next);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('catId is required');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if no ownership record exists (Requirement 9.2)', async () => {
    const req = createMockReq({ body: { catId: 'cat-1' } });
    const res = createMockRes();
    mockFindUnique.mockResolvedValue(null);

    const middleware = ownershipGate(1);
    await middleware(req as Request, res as Response, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Insufficient ownership level');
    expect(res.body.current).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 if ownership level is below required (Requirement 9.2)', async () => {
    const req = createMockReq({ body: { catId: 'cat-1' } });
    const res = createMockRes();
    mockFindUnique.mockResolvedValue({ userId: 'user-1', catId: 'cat-1', level: 0 });

    const middleware = ownershipGate(1);
    await middleware(req as Request, res as Response, next);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Insufficient ownership level');
    expect(res.body.current).toBe(0);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() if ownership level meets requirement (Requirement 9.1)', async () => {
    const req = createMockReq({ body: { catId: 'cat-1' } });
    const res = createMockRes();
    mockFindUnique.mockResolvedValue({ userId: 'user-1', catId: 'cat-1', level: 1 });

    const middleware = ownershipGate(1);
    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() if ownership level exceeds requirement', async () => {
    const req = createMockReq({ body: { catId: 'cat-1' } });
    const res = createMockRes();
    mockFindUnique.mockResolvedValue({ userId: 'user-1', catId: 'cat-1', level: 3 });

    const middleware = ownershipGate(1);
    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('resolves catId from req.params.catId if not in body', async () => {
    const req = createMockReq({ params: { catId: 'cat-from-params' } as any, body: {} });
    const res = createMockRes();
    mockFindUnique.mockResolvedValue({ userId: 'user-1', catId: 'cat-from-params', level: 1 });

    const middleware = ownershipGate(1);
    await middleware(req as Request, res as Response, next);

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { userId_catId: { userId: 'user-1', catId: 'cat-from-params' } },
    });
    expect(next).toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    const req = createMockReq({ body: { catId: 'cat-1' } });
    const res = createMockRes();
    mockFindUnique.mockRejectedValue(new Error('DB connection failed'));

    const middleware = ownershipGate(1);
    await middleware(req as Request, res as Response, next);

    expect(res.statusCode).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });
});
