/**
 * Unit tests for AlertsService
 *
 * Tests the push notification service with sliding-window rate limiter:
 * - Rate limiter allows up to 10 notifications per user per hour
 * - Rate limiter blocks the 11th non-milestone notification
 * - Milestone notifications bypass the rate limit
 * - notifyMany sends to all provided user IDs (respecting per-user rate limits)
 */

const mockNotificationLogCount = jest.fn();
const mockNotificationLogCreate = jest.fn().mockResolvedValue({});
const mockOwnershipFindMany = jest.fn().mockResolvedValue([]);

const mockPrisma = {
  notificationLog: {
    count: mockNotificationLogCount,
    create: mockNotificationLogCreate,
  },
  ownership: {
    findMany: mockOwnershipFindMany,
  },
} as any;

const mockPushSend = jest.fn().mockResolvedValue(undefined);
const mockPushProvider = {
  send: mockPushSend,
};

import { AlertsService } from '../../modules/alerts/alerts.service';

describe('AlertsService', () => {
  let service: AlertsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationLogCount.mockResolvedValue(0);
    service = new AlertsService(mockPrisma, mockPushProvider);
  });

  describe('notify (rate-limited)', () => {
    it('should send a notification when under rate limit', async () => {
      mockNotificationLogCount.mockResolvedValue(0);

      await service.notify('user-1', 'Hello', 'World', { key: 'val' });

      expect(mockPushSend).toHaveBeenCalledWith('user-1', 'Hello', 'World', { key: 'val' });
      expect(mockNotificationLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          title: 'Hello',
          body: 'World',
          isMilestone: false,
        }),
      });
    });

    it('should allow up to 10 notifications per user per hour', async () => {
      // Simulate 9 already sent (under the limit)
      mockNotificationLogCount.mockResolvedValue(9);

      await service.notify('user-1', 'Test', 'Notification 10');

      expect(mockPushSend).toHaveBeenCalledTimes(1);
      expect(mockNotificationLogCreate).toHaveBeenCalledTimes(1);
    });

    it('should block the 11th non-milestone notification', async () => {
      // Simulate 10 already sent (at the limit)
      mockNotificationLogCount.mockResolvedValue(10);

      await service.notify('user-1', 'Blocked', 'Should not send');

      expect(mockPushSend).not.toHaveBeenCalled();
      expect(mockNotificationLogCreate).not.toHaveBeenCalled();
    });

    it('should rate-limit per user independently', async () => {
      // user-1 is at limit, user-2 is not
      mockNotificationLogCount
        .mockResolvedValueOnce(10) // user-1 at limit
        .mockResolvedValueOnce(3); // user-2 under limit

      await service.notify('user-1', 'Title', 'Body');
      await service.notify('user-2', 'Title', 'Body');

      expect(mockPushSend).toHaveBeenCalledTimes(1);
      expect(mockPushSend).toHaveBeenCalledWith('user-2', 'Title', 'Body', undefined);
    });

    it('should query the sliding window correctly (last hour)', async () => {
      const beforeCall = Date.now();
      mockNotificationLogCount.mockResolvedValue(5);

      await service.notify('user-1', 'Title', 'Body');

      const countCall = mockNotificationLogCount.mock.calls[0][0];
      expect(countCall.where.userId).toBe('user-1');
      expect(countCall.where.isMilestone).toBe(false);
      // The sentAt.gte should be approximately 1 hour ago
      const windowStart = countCall.where.sentAt.gte as Date;
      const expectedStart = beforeCall - 60 * 60 * 1000;
      expect(windowStart.getTime()).toBeGreaterThanOrEqual(expectedStart - 100);
      expect(windowStart.getTime()).toBeLessThanOrEqual(expectedStart + 100);
    });
  });

  describe('notifyMilestone (bypasses rate limit)', () => {
    it('should send milestone notifications even when rate limit is exceeded', async () => {
      // Simulate user already at limit
      mockNotificationLogCount.mockResolvedValue(10);

      await service.notifyMilestone('user-1', 'Level Up!', 'You reached Level 2!', { catId: 'cat-1' });

      // Should NOT check rate limit for milestone
      expect(mockNotificationLogCount).not.toHaveBeenCalled();
      expect(mockPushSend).toHaveBeenCalledWith('user-1', 'Level Up!', 'You reached Level 2!', { catId: 'cat-1' });
      expect(mockNotificationLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          title: 'Level Up!',
          body: 'You reached Level 2!',
          isMilestone: true,
        }),
      });
    });

    it('should log milestone notifications with isMilestone=true', async () => {
      await service.notifyMilestone('user-1', 'Level Up!', 'Congrats!');

      expect(mockNotificationLogCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isMilestone: true,
        }),
      });
    });

    it('should always send milestones regardless of existing notification count', async () => {
      // Even with 100 notifications in the window, milestone should go through
      mockNotificationLogCount.mockResolvedValue(100);

      await service.notifyMilestone('user-1', 'Level Up!', 'You reached Level 5!');

      expect(mockPushSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyMany', () => {
    it('should send to all provided user IDs', async () => {
      mockNotificationLogCount.mockResolvedValue(0);

      await service.notifyMany(
        ['user-1', 'user-2', 'user-3'],
        'New Sighting',
        'A cat was spotted nearby!',
        { data: { catId: 'cat-1' } },
      );

      expect(mockPushSend).toHaveBeenCalledTimes(3);
      expect(mockPushSend).toHaveBeenCalledWith('user-1', 'New Sighting', 'A cat was spotted nearby!', { catId: 'cat-1' });
      expect(mockPushSend).toHaveBeenCalledWith('user-2', 'New Sighting', 'A cat was spotted nearby!', { catId: 'cat-1' });
      expect(mockPushSend).toHaveBeenCalledWith('user-3', 'New Sighting', 'A cat was spotted nearby!', { catId: 'cat-1' });
    });

    it('should respect per-user rate limits', async () => {
      // user-1 at limit, user-2 under limit
      mockNotificationLogCount
        .mockResolvedValueOnce(10) // user-1 blocked
        .mockResolvedValueOnce(5)  // user-2 allowed
        .mockResolvedValueOnce(10); // user-3 blocked

      await service.notifyMany(
        ['user-1', 'user-2', 'user-3'],
        'Title',
        'Body',
      );

      expect(mockPushSend).toHaveBeenCalledTimes(1);
      expect(mockPushSend).toHaveBeenCalledWith('user-2', 'Title', 'Body', undefined);
    });

    it('should continue sending to other users if one fails', async () => {
      mockNotificationLogCount.mockResolvedValue(0);
      mockPushSend
        .mockRejectedValueOnce(new Error('Push failed'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      // Should not throw
      await expect(
        service.notifyMany(['user-1', 'user-2', 'user-3'], 'Title', 'Body'),
      ).resolves.not.toThrow();
    });

    it('should handle empty user list gracefully', async () => {
      await service.notifyMany([], 'Title', 'Body');

      expect(mockPushSend).not.toHaveBeenCalled();
      expect(mockNotificationLogCount).not.toHaveBeenCalled();
    });
  });

  describe('notifyCatOwners', () => {
    it('should query Lvl1+ owners and notify them', async () => {
      mockOwnershipFindMany.mockResolvedValue([
        { userId: 'owner-1' },
        { userId: 'owner-2' },
      ]);
      mockNotificationLogCount.mockResolvedValue(0);

      await service.notifyCatOwners('cat-1', 'Sighting', 'Your cat was spotted!', { catId: 'cat-1' });

      expect(mockOwnershipFindMany).toHaveBeenCalledWith({
        where: { catId: 'cat-1', level: { gte: 1 }, revokedAt: null },
        select: { userId: true },
      });
      expect(mockPushSend).toHaveBeenCalledTimes(2);
    });

    it('should not send any notifications if no Lvl1+ owners exist', async () => {
      mockOwnershipFindMany.mockResolvedValue([]);

      await service.notifyCatOwners('cat-1', 'Sighting', 'Your cat was spotted!');

      expect(mockPushSend).not.toHaveBeenCalled();
    });
  });
});
