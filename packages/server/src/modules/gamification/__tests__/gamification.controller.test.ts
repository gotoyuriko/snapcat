import { Request, Response } from 'express';
import { GamificationController } from '../gamification.controller';

const mockGetUserStats = jest.fn();
const mockGetLeaderboard = jest.fn();

jest.mock('../gamification.service', () => {
  return {
    GamificationService: jest.fn().mockImplementation(() => ({
      getUserStats: mockGetUserStats,
      getLeaderboard: mockGetLeaderboard,
    })),
  };
});

function createMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: { userId: 'user-1', email: 'test@example.com' },
    query: {},
    ...overrides,
  };
}

function createMockRes(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = { statusCode: 0, body: null };
  res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
  res.json = jest.fn((data: any) => { res.body = data; return res; });
  return res;
}

describe('GamificationController', () => {
  let controller: GamificationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new GamificationController();
  });

  describe('GET /gamification/stats (getUserStats)', () => {
    it('returns 401 if user is not authenticated', async () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      await controller.getUserStats(req as Request, res as Response);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('returns 200 with the user stats', async () => {
      mockGetUserStats.mockResolvedValue({
        userId: 'user-1',
        displayName: 'Alice',
        email: 'test@example.com',
        xp: 150,
        catsDiscovered: 5,
        catsOwned: 2,
        rank: 4,
      });

      const req = createMockReq();
      const res = createMockRes();

      await controller.getUserStats(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.xp).toBe(150);
      expect(res.body.rank).toBe(4);
      expect(mockGetUserStats).toHaveBeenCalledWith('user-1');
    });

    it('returns 404 if the user is not found', async () => {
      mockGetUserStats.mockRejectedValue(new Error('User not found'));

      const req = createMockReq();
      const res = createMockRes();

      await controller.getUserStats(req as Request, res as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('returns 500 on unexpected error', async () => {
      mockGetUserStats.mockRejectedValue(new Error('DB error'));

      const req = createMockReq();
      const res = createMockRes();

      await controller.getUserStats(req as Request, res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });

  describe('GET /gamification/leaderboard (getLeaderboard)', () => {
    it('returns 200 with leaderboard entries using the default limit', async () => {
      mockGetLeaderboard.mockResolvedValue([
        { userId: 'u1', displayName: 'Alice', xp: 500, rank: 1 },
      ]);

      const req = createMockReq();
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(mockGetLeaderboard).toHaveBeenCalledWith(20);
    });

    it('clamps an out-of-range limit query param', async () => {
      mockGetLeaderboard.mockResolvedValue([]);

      const req = createMockReq({ query: { limit: '500' } });
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(mockGetLeaderboard).toHaveBeenCalledWith(100);
    });

    it('returns 500 on unexpected error', async () => {
      mockGetLeaderboard.mockRejectedValue(new Error('DB error'));

      const req = createMockReq();
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('DB error');
    });
  });
});
