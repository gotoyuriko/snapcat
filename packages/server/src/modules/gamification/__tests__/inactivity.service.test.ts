import { InactivityService, INACTIVITY_MONTHS, WARNING_DAYS } from '../inactivity.service';
import { GamificationService } from '../gamification.service';

/** A fixed "now" so month arithmetic is deterministic. */
const NOW = new Date('2026-07-05T12:00:00Z');

function monthsBefore(date: Date, months: number, extraDays = 0): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  d.setDate(d.getDate() - extraDays);
  return d;
}

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function createMockPrisma() {
  return {
    ownership: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { update: jest.fn().mockResolvedValue({}) },
    userCatDiscovery: { findUnique: jest.fn().mockResolvedValue(null) },
    cat: { findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', name: 'Whiskers' }) },
    donationXpLog: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { xpAwarded: 0 } }),
      create: jest.fn().mockResolvedValue({}),
    },
    scanXpLog: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
  } as any;
}

function createMockAlerts() {
  return {
    notify: jest.fn().mockResolvedValue(undefined),
    notifyMilestone: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('InactivityService.processInactivity (Req 16.1, 16.5, 16.6)', () => {
  let prisma: any;
  let alerts: any;
  let service: InactivityService;

  beforeEach(() => {
    prisma = createMockPrisma();
    alerts = createMockAlerts();
    service = new InactivityService(prisma, alerts);
  });

  it('revokes owners inactive for more than 8 months and notifies them', async () => {
    prisma.ownership.findMany
      // revoke query
      .mockResolvedValueOnce([
        { userId: 'u1', catId: 'c1', cat: { name: 'Whiskers' } },
      ])
      // warn query
      .mockResolvedValueOnce([]);

    const result = await service.processInactivity(NOW);

    expect(result).toEqual({ warned: 0, revoked: 1 });
    expect(prisma.ownership.update).toHaveBeenCalledWith({
      where: { userId_catId: { userId: 'u1', catId: 'c1' } },
      data: { revokedAt: NOW },
    });
    expect(alerts.notifyMilestone).toHaveBeenCalledWith(
      'u1',
      'Ownership Revoked',
      expect.stringContaining('Whiskers'),
    );
  });

  it('queries revocations with the 8-month cutoff and warnings with the 30-day window', async () => {
    await service.processInactivity(NOW);

    const revokeCutoff = monthsBefore(NOW, INACTIVITY_MONTHS);
    const warnCutoff = daysAfter(revokeCutoff, WARNING_DAYS);

    expect(prisma.ownership.findMany).toHaveBeenNthCalledWith(1, {
      where: { level: { gte: 1 }, revokedAt: null, lastActiveAt: { lte: revokeCutoff } },
      select: expect.anything(),
    });
    expect(prisma.ownership.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        level: { gte: 1 },
        revokedAt: null,
        inactivityWarnedAt: null,
        lastActiveAt: { lte: warnCutoff, gt: revokeCutoff },
      },
      select: expect.anything(),
    });
  });

  it('warns owners approaching the threshold, marks them warned, and bypasses the rate limit', async () => {
    prisma.ownership.findMany
      .mockResolvedValueOnce([]) // revoke query
      .mockResolvedValueOnce([{ userId: 'u2', catId: 'c2', cat: { name: 'Mochi' } }]);

    const result = await service.processInactivity(NOW);

    expect(result).toEqual({ warned: 1, revoked: 0 });
    expect(prisma.ownership.update).toHaveBeenCalledWith({
      where: { userId_catId: { userId: 'u2', catId: 'c2' } },
      data: { inactivityWarnedAt: NOW },
    });
    expect(alerts.notifyMilestone).toHaveBeenCalledWith(
      'u2',
      'Ownership At Risk',
      expect.stringContaining(`${WARNING_DAYS} days`),
    );
  });

  it('continues the batch when a push notification fails', async () => {
    prisma.ownership.findMany
      .mockResolvedValueOnce([
        { userId: 'u1', catId: 'c1', cat: { name: 'A' } },
        { userId: 'u2', catId: 'c2', cat: { name: 'B' } },
      ])
      .mockResolvedValueOnce([]);
    alerts.notifyMilestone.mockRejectedValueOnce(new Error('push down'));

    const result = await service.processInactivity(NOW);

    expect(result.revoked).toBe(2);
    expect(prisma.ownership.update).toHaveBeenCalledTimes(2);
  });
});

describe('Owner activity refresh & restore-on-rescan (Req 16.1, 16.4)', () => {
  let prisma: any;
  let service: GamificationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new GamificationService(prisma, createMockAlerts());
  });

  it('a scan refreshes lastActiveAt, clears the warning, and lifts revocation', async () => {
    await service.recordAction('u1', 'c1', 'scan');

    expect(prisma.ownership.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', catId: 'c1' },
      data: {
        lastActiveAt: expect.any(Date),
        inactivityWarnedAt: null,
        revokedAt: null,
      },
    });
  });

  it('a donation refreshes activity but does NOT lift revocation (only re-scans restore)', async () => {
    await service.recordAction('u1', 'c1', 'donation', 500);

    expect(prisma.ownership.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', catId: 'c1' },
      data: { lastActiveAt: expect.any(Date), inactivityWarnedAt: null },
    });
  });

  it('a scan already capped for today still counts as activity (refresh happens first)', async () => {
    prisma.scanXpLog.count.mockResolvedValue(1); // daily scan XP already awarded

    const result = await service.recordAction('u1', 'c1', 'scan');

    expect(result.xpAwarded).toBe(0);
    expect(prisma.ownership.updateMany).toHaveBeenCalled();
  });

  it('discovery actions do not touch the inactivity clock', async () => {
    prisma.userCatDiscovery.findUnique.mockResolvedValue({ userId: 'u1', catId: 'c1' });
    prisma.ownership.create = jest.fn().mockResolvedValue({ level: 3, xp: 100 });

    await service.recordAction('u1', 'c1', 'discover_new');

    expect(prisma.ownership.updateMany).not.toHaveBeenCalled();
  });
});
