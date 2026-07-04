import { YoloClient } from '../yolo.client';

// Mock sharp
jest.mock('sharp', () => {
  const mockSharp = jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ width: 640, height: 480 }),
    extract: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('cropped-image-data')),
  }));
  return mockSharp;
});

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('YoloClient', () => {
  const TEST_API_URL = 'http://localhost:8000';
  const TEST_API_KEY = 'test_api_key_123';
  let client: YoloClient;

  beforeEach(() => {
    client = new YoloClient(TEST_API_URL, TEST_API_KEY);
    mockFetch.mockReset();
  });

  describe('detectCat', () => {
    const imageBuffer = Buffer.from('fake-image-data');

    it('should return { noDetection: true } when inference returns detected=false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ detected: false }),
      });

      const result = await client.detectCat(imageBuffer);

      expect(result).toEqual({ noDetection: true });
    });

    it('should return { noDetection: true } when inference returns no box', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ detected: true }),
      });

      const result = await client.detectCat(imageBuffer);

      expect(result).toEqual({ noDetection: true });
    });

    it('should return { cropped: Buffer } when a cat is detected', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          detected: true,
          confidence: 0.92,
          box: { x1: 50, y1: 60, x2: 200, y2: 300 },
        }),
      });

      const result = await client.detectCat(imageBuffer);

      expect('cropped' in result).toBe(true);
      if ('cropped' in result) {
        expect(Buffer.isBuffer(result.cropped)).toBe(true);
      }
    });

    it('should send FormData POST to /detect endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ detected: false }),
      });

      await client.detectCat(imageBuffer);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${TEST_API_URL}/detect`);
      expect(opts.method).toBe('POST');
      expect(opts.body).toBeInstanceOf(FormData);
    });

    it('should throw on non-OK HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(client.detectCat(imageBuffer)).rejects.toThrow(
        'Detect request failed with status 500: Internal Server Error'
      );
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(client.detectCat(imageBuffer)).rejects.toThrow(
        'Inference service unavailable: ECONNREFUSED'
      );
    });
  });

  describe('detectCats (raw detections)', () => {
    const imageBuffer = Buffer.from('fake-image-data');

    it('should return a detection array when detected=true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          detected: true,
          confidence: 0.92,
          box: { x1: 10, y1: 20, x2: 110, y2: 220 },
        }),
      });

      const detections = await client.detectCats(imageBuffer);

      expect(detections).toHaveLength(1);
      expect(detections[0]).toEqual({
        confidence: 0.92,
        boundingBox: { x: 10, y: 20, width: 100, height: 200 },
      });
    });

    it('should return empty array when no detection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ detected: false }),
      });

      const detections = await client.detectCats(imageBuffer);

      expect(detections).toHaveLength(0);
    });

    it('should default confidence to 0 when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          detected: true,
          box: { x1: 0, y1: 0, x2: 100, y2: 100 },
        }),
      });

      const detections = await client.detectCats(imageBuffer);

      expect(detections).toHaveLength(1);
      expect(detections[0].confidence).toBe(0);
    });
  });
});
