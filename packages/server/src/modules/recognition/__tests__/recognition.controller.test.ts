import { Request, Response } from 'express';
import { RecognitionController } from '../recognition.controller';
import { RecognitionService } from '../recognition.service';
import { PhotoStorageService } from '../photo-storage.service';

// Mock the service dependencies so the controller can be instantiated standalone
jest.mock('../recognition.service');
jest.mock('../yolo.client');
jest.mock('../megadescriptor.client');
jest.mock('../vector.service');
jest.mock('../photo-storage.service');
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

const STUB_PHOTO_URL = 'http://localhost:3000/api/recognition/photos/stub.jpg';

describe('RecognitionController', () => {
  let controller: RecognitionController;
  let mockService: jest.Mocked<RecognitionService>;
  let mockPhotoStorageService: jest.Mocked<PhotoStorageService>;
  let mockReq: any;
  let mockRes: Partial<Response>;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockService = {
      recognizeCat: jest.fn(),
      confirmMatch: jest.fn(),
    } as unknown as jest.Mocked<RecognitionService>;

    mockPhotoStorageService = {
      storePhoto: jest.fn().mockResolvedValue('stub.jpg'),
      buildUrl: jest.fn().mockReturnValue(STUB_PHOTO_URL),
      resolvePhotoPath: jest.fn(),
      deletePhoto: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PhotoStorageService>;

    controller = new RecognitionController(mockService, mockPhotoStorageService);

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      user: { userId: 'user-123', email: 'test@example.com' },
      body: {},
      protocol: 'http',
      get: jest.fn().mockReturnValue('localhost:3000'),
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
  });

  describe('POST /scan', () => {
    it('should return 400 when no photo file is provided', async () => {
      mockReq.file = undefined;
      mockReq.body = { userGPS: JSON.stringify({ lat: 3.14, lng: 101.7 }) };

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Photo file is required' });
    });

    it('should return 400 when userGPS is missing', async () => {
      mockReq.file = {
        buffer: Buffer.from('fake-photo'),
        fieldname: 'photo',
        originalname: 'cat.jpg',
        mimetype: 'image/jpeg',
      } as any;
      mockReq.body = {};

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should return 400 when userGPS has invalid coordinates', async () => {
      mockReq.file = {
        buffer: Buffer.from('fake-photo'),
        fieldname: 'photo',
        originalname: 'cat.jpg',
        mimetype: 'image/jpeg',
      } as any;
      mockReq.body = { userGPS: JSON.stringify({ lat: 200, lng: 101.7 }) };

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid GPS data' }),
      );
    });

    it('should call recognizeCat and return 422 for no_cat result', async () => {
      mockReq.file = {
        buffer: Buffer.from('fake-photo'),
        fieldname: 'photo',
        originalname: 'cat.jpg',
        mimetype: 'image/jpeg',
      } as any;
      mockReq.body = { userGPS: JSON.stringify({ lat: 3.14, lng: 101.7 }) };

      mockService.recognizeCat.mockResolvedValue({ result: 'no_cat' });

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(mockService.recognizeCat).toHaveBeenCalledWith(
        Buffer.from('fake-photo'),
        { lat: 3.14, lng: 101.7 },
        'user-123',
        STUB_PHOTO_URL,
      );
      expect(statusMock).toHaveBeenCalledWith(422);
      expect(jsonMock).toHaveBeenCalledWith({
        result: 'no_cat',
        message: 'No cat detected — please retake',
      });
    });

    it('should return 200 for a matched result', async () => {
      mockReq.file = {
        buffer: Buffer.from('fake-photo'),
        fieldname: 'photo',
        originalname: 'cat.jpg',
        mimetype: 'image/jpeg',
      } as any;
      mockReq.body = { userGPS: JSON.stringify({ lat: 3.14, lng: 101.7 }) };

      const matchedResult = {
        result: 'matched' as const,
        cat: {
          id: 'cat-abc',
          name: 'Whiskers',
          embeddingRef: 'ref-1',
          firstDiscovererId: 'user-1',
          lastKnownApproxLat: 3.14,
          lastKnownApproxLng: 101.7,
          photoUrl: '',
          registeredAt: new Date(),
        },
        xpAwarded: 10,
        levelUp: false,
      };
      mockService.recognizeCat.mockResolvedValue(matchedResult);

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(matchedResult);
    });

    it('should return 200 for a confirm_needed result', async () => {
      mockReq.file = {
        buffer: Buffer.from('fake-photo'),
        fieldname: 'photo',
        originalname: 'cat.jpg',
        mimetype: 'image/jpeg',
      } as any;
      mockReq.body = { userGPS: JSON.stringify({ lat: 3.14, lng: 101.7 }) };

      const confirmResult = {
        result: 'confirm_needed' as const,
        candidateCat: {
          id: 'cat-abc',
          name: 'Whiskers',
          embeddingRef: 'ref-1',
          firstDiscovererId: 'user-1',
          lastKnownApproxLat: 3.14,
          lastKnownApproxLng: 101.7,
          photoUrl: '',
          registeredAt: new Date(),
        },
        embedding: [0.5, 0.5, 0.5],
        photoUrl: '',
      };
      mockService.recognizeCat.mockResolvedValue(confirmResult);

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(confirmResult);
    });

    it('should return 201 for a new_cat result', async () => {
      mockReq.file = {
        buffer: Buffer.from('fake-photo'),
        fieldname: 'photo',
        originalname: 'cat.jpg',
        mimetype: 'image/jpeg',
      } as any;
      mockReq.body = { userGPS: JSON.stringify({ lat: 3.14, lng: 101.7 }) };

      const newCatResult = {
        result: 'new_cat' as const,
        cat: {
          id: 'new-cat-id',
          name: '',
          embeddingRef: '',
          firstDiscovererId: 'user-123',
          lastKnownApproxLat: 3.14,
          lastKnownApproxLng: 101.7,
          photoUrl: '',
          registeredAt: new Date(),
        },
        xpAwarded: 50,
      };
      mockService.recognizeCat.mockResolvedValue(newCatResult);

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(newCatResult);
    });

    it('should return 503 when AI service is unavailable', async () => {
      mockReq.file = {
        buffer: Buffer.from('fake-photo'),
        fieldname: 'photo',
        originalname: 'cat.jpg',
        mimetype: 'image/jpeg',
      } as any;
      mockReq.body = { userGPS: JSON.stringify({ lat: 3.14, lng: 101.7 }) };

      mockService.recognizeCat.mockRejectedValue(
        new Error('MegaDescriptor service unavailable: connection timeout'),
      );

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'AI service temporarily unavailable' }),
      );
    });

    it('should return 500 for unknown errors', async () => {
      mockReq.file = {
        buffer: Buffer.from('fake-photo'),
        fieldname: 'photo',
        originalname: 'cat.jpg',
        mimetype: 'image/jpeg',
      } as any;
      mockReq.body = { userGPS: JSON.stringify({ lat: 3.14, lng: 101.7 }) };

      mockService.recognizeCat.mockRejectedValue(new Error('Something unexpected'));

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
    });

    it('should accept userGPS as an object (not just string)', async () => {
      mockReq.file = {
        buffer: Buffer.from('fake-photo'),
        fieldname: 'photo',
        originalname: 'cat.jpg',
        mimetype: 'image/jpeg',
      } as any;
      mockReq.body = { userGPS: { lat: 3.14, lng: 101.7 } };

      mockService.recognizeCat.mockResolvedValue({ result: 'no_cat' });

      await controller.scan(mockReq as Request, mockRes as Response);

      expect(mockService.recognizeCat).toHaveBeenCalledWith(
        Buffer.from('fake-photo'),
        { lat: 3.14, lng: 101.7 },
        'user-123',
        STUB_PHOTO_URL,
      );
    });
  });

  describe('POST /scan/confirm', () => {
    it('should return 400 when body validation fails', async () => {
      mockReq.body = { catId: '', embedding: 'not-an-array' };

      await controller.confirm(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation failed' }),
      );
    });

    it('should call confirmMatch and return 200 for matched result', async () => {
      mockReq.body = {
        catId: 'cat-abc',
        embedding: [0.5, 0.5, 0.5],
        userGPS: { lat: 3.14, lng: 101.7 },
        photoUrl: 'https://example.com/photo.jpg',
      };

      const matchedResult = {
        result: 'matched' as const,
        cat: {
          id: 'cat-abc',
          name: 'Whiskers',
          embeddingRef: 'ref-1',
          firstDiscovererId: 'user-1',
          lastKnownApproxLat: 3.14,
          lastKnownApproxLng: 101.7,
          photoUrl: '',
          registeredAt: new Date(),
        },
        xpAwarded: 10,
        levelUp: false,
      };
      mockService.confirmMatch.mockResolvedValue(matchedResult);

      await controller.confirm(mockReq as Request, mockRes as Response);

      expect(mockService.confirmMatch).toHaveBeenCalledWith(
        'user-123',
        'cat-abc',
        [0.5, 0.5, 0.5],
        { lat: 3.14, lng: 101.7 },
        'https://example.com/photo.jpg',
      );
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(matchedResult);
    });

    it('should call confirmMatch with catId "new" and return 201', async () => {
      mockReq.body = {
        catId: 'new',
        embedding: [0.5, 0.5, 0.5],
        userGPS: { lat: 3.14, lng: 101.7 },
      };

      const newCatResult = {
        result: 'new_cat' as const,
        cat: {
          id: 'new-cat-id',
          name: '',
          embeddingRef: '',
          firstDiscovererId: 'user-123',
          lastKnownApproxLat: 3.14,
          lastKnownApproxLng: 101.7,
          photoUrl: '',
          registeredAt: new Date(),
        },
        xpAwarded: 50,
      };
      mockService.confirmMatch.mockResolvedValue(newCatResult);

      await controller.confirm(mockReq as Request, mockRes as Response);

      expect(mockService.confirmMatch).toHaveBeenCalledWith(
        'user-123',
        'new',
        [0.5, 0.5, 0.5],
        { lat: 3.14, lng: 101.7 },
        '',
      );
      expect(statusMock).toHaveBeenCalledWith(201);
    });

    it('should return 503 when AI service throws', async () => {
      mockReq.body = {
        catId: 'cat-abc',
        embedding: [0.5, 0.5],
        userGPS: { lat: 3.14, lng: 101.7 },
      };

      mockService.confirmMatch.mockRejectedValue(
        new Error('YOLO API request failed with status 503: Service unavailable'),
      );

      await controller.confirm(mockReq as Request, mockRes as Response);

      expect(statusMock).toHaveBeenCalledWith(503);
    });

    it('should default photoUrl to empty string when not provided', async () => {
      mockReq.body = {
        catId: 'cat-abc',
        embedding: [0.5],
        userGPS: { lat: 3.14, lng: 101.7 },
      };

      mockService.confirmMatch.mockResolvedValue({
        result: 'matched' as const,
        cat: {
          id: 'cat-abc',
          name: '',
          embeddingRef: '',
          firstDiscovererId: 'user-1',
          lastKnownApproxLat: 3.14,
          lastKnownApproxLng: 101.7,
          photoUrl: '',
          registeredAt: new Date(),
        },
        xpAwarded: 10,
        levelUp: false,
      });

      await controller.confirm(mockReq as Request, mockRes as Response);

      expect(mockService.confirmMatch).toHaveBeenCalledWith(
        'user-123',
        'cat-abc',
        [0.5],
        { lat: 3.14, lng: 101.7 },
        '',
      );
    });
  });
});
