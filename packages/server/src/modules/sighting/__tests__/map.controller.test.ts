import { Request, Response } from 'express';
import { SightingController } from '../sighting.controller';
import { SightingService } from '../sighting.service';

jest.mock('../sighting.service');
jest.mock('../gps-fuzz');
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

describe('SightingController – getMapPins', () => {
  let controller: SightingController;
  let mockService: jest.Mocked<SightingService>;
  let mockReq: any;
  let mockRes: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockService = {
      getMapPins: jest.fn(),
      appendSighting: jest.fn(),
      updateCatLastKnownLocation: jest.fn(),
      getSightingsInArea: jest.fn(),
      getCatSightings: jest.fn(),
    } as unknown as jest.Mocked<SightingService>;

    controller = new SightingController(mockService);

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      user: { userId: 'user-123', email: 'test@example.com' },
      query: {},
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
  });

  it('should return 200 with all cat pins when no bounding box provided', async () => {
    const pins = [
      { catId: 'cat-1', name: 'Whiskers', photoUrl: 'photo.jpg', approxLat: 3.14, approxLng: 101.7, discovered: true },
      { catId: 'cat-2', approxLat: 3.15, approxLng: 101.8, discovered: false },
    ];
    mockService.getMapPins.mockResolvedValue(pins as any);

    await controller.getMapPins(mockReq as Request, mockRes as Response);

    expect(mockService.getMapPins).toHaveBeenCalledWith('user-123', undefined);
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(pins);
  });

  it('should pass bounding box params to service when provided', async () => {
    mockReq.query = { neLat: '4.0', neLng: '102.0', swLat: '3.0', swLng: '101.0' };
    mockService.getMapPins.mockResolvedValue([]);

    await controller.getMapPins(mockReq as Request, mockRes as Response);

    expect(mockService.getMapPins).toHaveBeenCalledWith('user-123', {
      neLat: 4.0,
      neLng: 102.0,
      swLat: 3.0,
      swLng: 101.0,
    });
    expect(statusMock).toHaveBeenCalledWith(200);
  });

  it('should return 400 when bounding box params are not valid numbers', async () => {
    mockReq.query = { neLat: 'abc', neLng: '102.0', swLat: '3.0', swLng: '101.0' };

    await controller.getMapPins(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Invalid bounding box') }),
    );
  });

  it('should not require bounding box — partial params are ignored', async () => {
    // Only some bounding box params provided — treated as no bounding box
    mockReq.query = { neLat: '4.0', neLng: '102.0' };
    mockService.getMapPins.mockResolvedValue([]);

    await controller.getMapPins(mockReq as Request, mockRes as Response);

    expect(mockService.getMapPins).toHaveBeenCalledWith('user-123', undefined);
    expect(statusMock).toHaveBeenCalledWith(200);
  });

  it('should return discovered cat pins with full data', async () => {
    const discoveredPin = {
      catId: 'cat-1',
      name: 'Mr. Fluff',
      photoUrl: 'https://example.com/fluff.jpg',
      approxLat: 3.14,
      approxLng: 101.7,
      discovered: true,
    };
    mockService.getMapPins.mockResolvedValue([discoveredPin] as any);

    await controller.getMapPins(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith([discoveredPin]);
  });

  it('should return undiscovered cat pins without name or photo', async () => {
    const undiscoveredPin = {
      catId: 'cat-2',
      approxLat: 3.15,
      approxLng: 101.8,
      discovered: false,
    };
    mockService.getMapPins.mockResolvedValue([undiscoveredPin] as any);

    await controller.getMapPins(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith([undiscoveredPin]);
  });

  it('should return 500 when service throws', async () => {
    mockService.getMapPins.mockRejectedValue(new Error('DB connection lost'));

    await controller.getMapPins(mockReq as Request, mockRes as Response);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'DB connection lost' });
  });
});
