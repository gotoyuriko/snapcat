import { Request, Response } from 'express';
import { LeaderboardController } from '../../modules/leaderboard/leaderboard.controller';

// Mock LeaderboardService
const mockHasDiscovery = jest.fn();
const mockGetCatLeaderboard = jest.fn();

jest.mock('../../modules/leaderboard/leaderboard.service', () => {
  return {
    LeaderboardService: jest.fn().mockImplementation(() => ({
      hasDiscovery: mockHasDiscovery,
      getCatLeaderboard: mockGetCatLeaderboard,
    })),
  };
});

function createMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    user: { userId: 'user-1', email: 'test@example.com' },
    params: { catId: 'cat-1' },
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

describe('LeaderboardController', () => {
  let controller: LeaderboardController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LeaderboardController();
  });

  describe('GET /cats/:catId/leaderboard', () => {
    it('returns 401 if user is not authenticated', async () => {
      const req = createMockReq({ user: undefined });
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });

    it('returns 403 if user has no UserCatDiscovery record for the cat', async () => {
      mockHasDiscovery.mockResolvedValue(false);

      const req = createMockReq();
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toContain('Access denied');
      expect(mockHasDiscovery).toHaveBeenCalledWith('user-1', 'cat-1');
    });

    it('returns 200 with leaderboard entries when owners exist', async () => {
      mockHasDiscovery.mockResolvedValue(true);
      const mockEntries = [
        { userId: 'owner-1', displayName: 'Alice', level: 3, xp: 50, rank: 1 },
        { userId: 'owner-2', displayName: 'Bob', level: 2, xp: 30, rank: 2 },
      ];
      mockGetCatLeaderboard.mockResolvedValue({ entries: mockEntries });

      const req = createMockReq();
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.entries).toEqual(mockEntries);
      expect(res.body.message).toBeUndefined();
      expect(mockGetCatLeaderboard).toHaveBeenCalledWith('cat-1', 20);
    });

    it('returns 200 with empty entries and "No owners yet" when no Lvl1+ owners', async () => {
      mockHasDiscovery.mockResolvedValue(true);
      mockGetCatLeaderboard.mockResolvedValue({ entries: [], message: 'No owners yet' });

      const req = createMockReq();
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.entries).toEqual([]);
      expect(res.body.message).toBe('No owners yet');
    });

    it('respects limit query parameter', async () => {
      mockHasDiscovery.mockResolvedValue(true);
      mockGetCatLeaderboard.mockResolvedValue({ entries: [] , message: 'No owners yet' });

      const req = createMockReq({ query: { limit: '5' } });
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(mockGetCatLeaderboard).toHaveBeenCalledWith('cat-1', 5);
    });

    it('caps limit at 100', async () => {
      mockHasDiscovery.mockResolvedValue(true);
      mockGetCatLeaderboard.mockResolvedValue({ entries: [], message: 'No owners yet' });

      const req = createMockReq({ query: { limit: '500' } });
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(mockGetCatLeaderboard).toHaveBeenCalledWith('cat-1', 100);
    });

    it('uses default limit of 20 for invalid limit param', async () => {
      mockHasDiscovery.mockResolvedValue(true);
      mockGetCatLeaderboard.mockResolvedValue({ entries: [], message: 'No owners yet' });

      const req = createMockReq({ query: { limit: 'invalid' } });
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(200);
      expect(mockGetCatLeaderboard).toHaveBeenCalledWith('cat-1', 20);
    });

    it('returns 500 on internal error', async () => {
      mockHasDiscovery.mockRejectedValue(new Error('DB error'));

      const req = createMockReq();
      const res = createMockRes();

      await controller.getLeaderboard(req as Request, res as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('Internal server error');
    });
  });
});
