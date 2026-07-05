import { SightingService } from '../../modules/sighting/sighting.service';
import { AlertsService } from '../../modules/alerts/alerts.service';

/**
 * Unit tests for Requirement 12.4:
 * WHEN a new Sighting is recorded for a Cat, THE System SHALL send a push notification
 * to all Lvl1+ Owners of that Cat only when at least one Lvl1+ Owner exists.
 */

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  const mockPrisma = {
    sighting: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    cat: {
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    ownership: {
      findMany: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
    __mockPrisma: mockPrisma,
  };
});

// Mock the GPS fuzz module to return predictable results
jest.mock('../../modules/sighting/gps-fuzz', () => ({
  fuzzCoordinates: (lat: number, lng: number) => ({
    fuzzedLat: lat + 0.001,
    fuzzedLng: lng + 0.001,
  }),
}));

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client');

describe('SightingService — New sighting notifications (Req 12.4)', () => {
  let service: SightingService;
  let mockAlertsService: jest.Mocked<AlertsService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAlertsService = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyMilestone: jest.fn().mockResolvedValue(undefined),
      notifyMany: jest.fn().mockResolvedValue(undefined),
      notifyCatOwners: jest.fn().mockResolvedValue(undefined),
    } as any;

    service = new SightingService(undefined, mockAlertsService);

    // Default mock: sighting.create returns valid sighting
    mockPrisma.sighting.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'sighting-1',
        catId: data.catId,
        reporterId: data.reporterId,
        fuzzedLat: data.fuzzedLat,
        fuzzedLng: data.fuzzedLng,
        photoUrl: data.photoUrl,
        type: data.type,
        timestamp: new Date('2025-01-01'),
      }),
    );

    // Default mock: cat.update succeeds
    mockPrisma.cat.update.mockResolvedValue({});
  });

  it('notifies all Lvl1+ owners when a new sighting is created', async () => {
    // Two Lvl1+ owners exist, neither is the reporter
    mockPrisma.ownership.findMany.mockResolvedValue([
      { userId: 'owner-1' },
      { userId: 'owner-2' },
    ]);
    mockPrisma.cat.findUnique.mockResolvedValue({ name: 'Whiskers' });

    await service.appendSighting('cat-1', 'reporter-99', { lat: 3.0, lng: 101.0 }, 'photo.jpg', 'scan');

    expect(mockAlertsService.notifyMany).toHaveBeenCalledWith(
      ['owner-1', 'owner-2'],
      'New Sighting',
      'A new sighting of Whiskers was reported!',
      { data: { catId: 'cat-1' } },
    );
  });

  it('excludes the reporter from the notification list', async () => {
    // Reporter is also an owner — they should not be notified
    mockPrisma.ownership.findMany.mockResolvedValue([
      { userId: 'owner-1' },
    ]);
    mockPrisma.cat.findUnique.mockResolvedValue({ name: 'Milo' });

    await service.appendSighting('cat-1', 'reporter-99', { lat: 3.0, lng: 101.0 }, 'photo.jpg', 'scan');

    // The ownership query excludes the reporter via { userId: { not: reporterId } }
    expect(mockPrisma.ownership.findMany).toHaveBeenCalledWith({
      where: { catId: 'cat-1', level: { gte: 1 }, revokedAt: null, userId: { not: 'reporter-99' } },
      select: { userId: true },
    });
  });

  it('does not send notifications if no Lvl1+ owners exist', async () => {
    mockPrisma.ownership.findMany.mockResolvedValue([]);

    await service.appendSighting('cat-1', 'reporter-99', { lat: 3.0, lng: 101.0 }, 'photo.jpg', 'scan');

    expect(mockAlertsService.notifyMany).not.toHaveBeenCalled();
  });

  it('does not break sighting creation when notification fails', async () => {
    mockPrisma.ownership.findMany.mockResolvedValue([
      { userId: 'owner-1' },
    ]);
    mockPrisma.cat.findUnique.mockResolvedValue({ name: 'Neko' });
    // Simulate notification failure
    mockAlertsService.notifyMany.mockRejectedValue(new Error('Push service down'));

    const result = await service.appendSighting('cat-1', 'reporter-99', { lat: 3.0, lng: 101.0 }, 'photo.jpg', 'scan');

    // Sighting should still be returned successfully
    expect(result.id).toBe('sighting-1');
    expect(result.catId).toBe('cat-1');
  });

  it('does not send notifications when no AlertsService is provided (backward compat)', async () => {
    const serviceWithoutAlerts = new SightingService();

    await serviceWithoutAlerts.appendSighting('cat-1', 'reporter-99', { lat: 3.0, lng: 101.0 }, 'photo.jpg', 'scan');

    // No notification calls since alertsService is null
    expect(mockAlertsService.notifyMany).not.toHaveBeenCalled();
  });

  it('uses a fallback cat name when cat is not found', async () => {
    mockPrisma.ownership.findMany.mockResolvedValue([
      { userId: 'owner-1' },
    ]);
    mockPrisma.cat.findUnique.mockResolvedValue(null);

    await service.appendSighting('cat-1', 'reporter-99', { lat: 3.0, lng: 101.0 }, 'photo.jpg', 'scan');

    expect(mockAlertsService.notifyMany).toHaveBeenCalledWith(
      ['owner-1'],
      'New Sighting',
      'A new sighting of a cat was reported!',
      { data: { catId: 'cat-1' } },
    );
  });
});
