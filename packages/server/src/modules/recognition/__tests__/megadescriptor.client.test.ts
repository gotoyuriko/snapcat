import { MegaDescriptorClient } from '../megadescriptor.client';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('MegaDescriptorClient', () => {
  const TEST_API_URL = 'https://api-inference.huggingface.co/models/test-model';
  const TEST_API_KEY = 'hf_test_key_123';
  let client: MegaDescriptorClient;

  beforeEach(() => {
    client = new MegaDescriptorClient(TEST_API_URL, TEST_API_KEY);
    mockFetch.mockReset();
  });

  describe('embed', () => {
    const validBuffer = Buffer.from('fake-image-data');
    const valid512Embedding = Array.from({ length: 512 }, (_, i) => i * 0.001);

    it('should return a Float32Array of length 512 for a flat array response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => valid512Embedding,
      });

      const result = await client.embed(validBuffer);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(512);
      expect(result[0]).toBeCloseTo(0);
      expect(result[1]).toBeCloseTo(0.001);
    });

    it('should return a Float32Array of length 512 for a nested array response', async () => {
      // HuggingFace batch response format: [[...embedding...]]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [valid512Embedding],
      });

      const result = await client.embed(validBuffer);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(512);
    });

    it('should send the correct headers and body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => valid512Embedding,
      });

      await client.embed(validBuffer);

      expect(mockFetch).toHaveBeenCalledWith(TEST_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TEST_API_KEY}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(validBuffer),
      });
    });

    it('should throw if API key is not configured', async () => {
      const noKeyClient = new MegaDescriptorClient(TEST_API_URL, '');

      await expect(noKeyClient.embed(validBuffer)).rejects.toThrow(
        'MegaDescriptor API key is not configured',
      );
    });

    it('should throw if croppedBuffer is empty', async () => {
      await expect(client.embed(Buffer.alloc(0))).rejects.toThrow(
        'croppedBuffer must be a non-empty Buffer',
      );
    });

    it('should throw if embedding length is not 512', async () => {
      const wrongLength = Array.from({ length: 256 }, () => 0.5);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => wrongLength,
      });

      await expect(client.embed(validBuffer)).rejects.toThrow(
        'MegaDescriptor returned embedding of length 256, expected 512',
      );
    });

    it('should throw on HTTP 503 with service unavailable message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Model is loading',
        statusText: 'Service Unavailable',
      });

      await expect(client.embed(validBuffer)).rejects.toThrow(
        'MegaDescriptor service temporarily unavailable',
      );
    });

    it('should throw on non-OK HTTP responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
        statusText: 'Unauthorized',
      });

      await expect(client.embed(validBuffer)).rejects.toThrow(
        'MegaDescriptor API error (HTTP 401): Unauthorized',
      );
    });

    it('should throw on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(client.embed(validBuffer)).rejects.toThrow(
        'MegaDescriptor service unavailable: ECONNREFUSED',
      );
    });

    it('should throw on unexpected response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ error: 'something unexpected' }),
      });

      await expect(client.embed(validBuffer)).rejects.toThrow(
        'MegaDescriptor returned an unexpected response format',
      );
    });
  });
});
