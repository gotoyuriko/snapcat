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
  const TEST_API_URL = 'https://api.ultralytics.com/v1/predict';
  const TEST_API_KEY = 'test_api_key_123';
  let client: YoloClient;

  beforeEach(() => {
    client = new YoloClient(TEST_API_URL, TEST_API_KEY);
    mockFetch.mockReset();
  });

  describe('detectCat', () => {
    const imageBuffer = Buffer.from('fake-image-data');

    it('should return { noDetection: true } when YOLO detects no cats', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });

      const result = await client.detectCat(imageBuffer);

      expect(result).toEqual({ noDetection: true });
    });

    it('should return { noDetection: true } when YOLO detects only non-cat objects', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              class: 0,
              name: 'person',
              confidence: 0.95,
              box: { x1: 10, y1: 10, x2: 100, y2: 100 },
            },
            {
              class: 16,
              name: 'dog',
              confidence: 0.88,
              box: { x1: 200, y1: 200, x2: 300, y2: 300 },
            },
          ],
        }),
      });

      const result = await client.detectCat(imageBuffer);

      expect(result).toEqual({ noDetection: true });
    });

    it('should return { cropped: Buffer } when a cat is detected (by class ID)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              class: CAT_CLASS_ID,
              name: 'cat',
              confidence: 0.92,
              box: { x1: 50, y1: 60, x2: 200, y2: 300 },
            },
          ],
        }),
      });

      const result = await client.detectCat(imageBuffer);

      expect('cropped' in result).toBe(true);
      if ('cropped' in result) {
        expect(Buffer.isBuffer(result.cropped)).toBe(true);
      }
    });

    it('should return { cropped: Buffer } when a cat is detected (by class name)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ([
          {
            class: 15,
            name: 'cat',
            confidence: 0.85,
            box: { x1: 20, y1: 30, x2: 150, y2: 200 },
          },
        ]),
      });

      const result = await client.detectCat(imageBuffer);

      expect('cropped' in result).toBe(true);
    });

    it('should pick the highest-confidence cat when multiple cats are detected', async () => {
      const extractFn = jest.fn().mockReturnThis();
      const toBufferFn = jest.fn().mockResolvedValue(Buffer.from('cropped'));
      const sharp = require('sharp');
      sharp.mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({ width: 640, height: 480 }),
        extract: extractFn,
        toBuffer: toBufferFn,
      })).mockImplementationOnce(() => ({
        metadata: jest.fn().mockResolvedValue({ width: 640, height: 480 }),
        extract: extractFn,
        toBuffer: toBufferFn,
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              class: 15,
              name: 'cat',
              confidence: 0.60,
              box: { x1: 0, y1: 0, x2: 50, y2: 50 },
            },
            {
              class: 15,
              name: 'cat',
              confidence: 0.95,
              box: { x1: 100, y1: 100, x2: 300, y2: 400 },
            },
            {
              class: 15,
              name: 'cat',
              confidence: 0.70,
              box: { x1: 400, y1: 400, x2: 500, y2: 500 },
            },
          ],
        }),
      });

      const result = await client.detectCat(imageBuffer);

      expect('cropped' in result).toBe(true);
      // Verify that extract was called with the highest-confidence bounding box
      expect(extractFn).toHaveBeenCalledWith({
        left: 100,
        top: 100,
        width: 200,
        height: 300,
      });
    });

    it('should send correct request to YOLO API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });

      await client.detectCat(imageBuffer);

      expect(mockFetch).toHaveBeenCalledWith(TEST_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': TEST_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'yolov8n',
          image: imageBuffer.toString('base64'),
          confidence: 0.25,
        }),
      });
    });

    it('should throw if API key is not configured', async () => {
      const noKeyClient = new YoloClient(TEST_API_URL, '');

      await expect(noKeyClient.detectCat(imageBuffer)).rejects.toThrow(
        'YOLO API key is not configured'
      );
    });

    it('should throw on non-OK HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(client.detectCat(imageBuffer)).rejects.toThrow(
        'YOLO API request failed with status 500'
      );
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(client.detectCat(imageBuffer)).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('detectCats (raw detections)', () => {
    const imageBuffer = Buffer.from('fake-image-data');

    it('should return all cat detections with bounding box info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              class: 15,
              name: 'cat',
              confidence: 0.92,
              box: { x1: 10, y1: 20, x2: 110, y2: 220 },
            },
            {
              class: 0,
              name: 'person',
              confidence: 0.85,
              box: { x1: 200, y1: 200, x2: 400, y2: 400 },
            },
            {
              class: 15,
              name: 'cat',
              confidence: 0.78,
              box: { x1: 300, y1: 50, x2: 450, y2: 250 },
            },
          ],
        }),
      });

      const detections = await client.detectCats(imageBuffer);

      expect(detections).toHaveLength(2);
      expect(detections[0]).toEqual({
        confidence: 0.92,
        boundingBox: { x: 10, y: 20, width: 100, height: 200 },
      });
      expect(detections[1]).toEqual({
        confidence: 0.78,
        boundingBox: { x: 300, y: 50, width: 150, height: 200 },
      });
    });
  });
});

const CAT_CLASS_ID = 15;
