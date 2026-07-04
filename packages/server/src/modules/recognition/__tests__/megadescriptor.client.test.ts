import { MegaDescriptorClient } from '../megadescriptor.client';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('MegaDescriptorClient', () => {
  const TEST_API_URL = 'http://localhost:8000';
  const TEST_API_KEY = 'hf_test_key_123';
  let client: MegaDescriptorClient;

  beforeEach(() => {
    client = new MegaDescriptorClient(TEST_API_URL, TEST_API_KEY);
    mockFetch.mockReset();
  });

  describe('embed', () => {
    const validBuffer = Buffer.from('fake-image-data');
    const valid768Embedding = Array.from({ length: 768 }, (_, i) => i * 0.001);

    it('should return a Float32Array of length 768 for a valid response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ embedding: valid768Embedding }),
      });

      const result = await client.embed(validBuffer);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(768);
      expect(result[0]).toBeCloseTo(0);
      expect(result[1]).toBeCloseTo(0.001);
    });

    it('should send FormData POST to /embed endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ embedding: valid768Embedding }),
      });

      await client.embed(validBuffer);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(`${TEST_API_URL}/embed`);
      expect(opts.method).toBe('POST');
      expect(opts.body).toBeInstanceOf(FormData);
    });

    it('should throw if croppedBuffer is empty', async () => {
      await expect(client.embed(Buffer.alloc(0))).rejects.toThrow(
        'croppedBuffer must be a non-empty Buffer',
      );
    });

    it('should throw if embedding length is not 768', async () => {
      const wrongLength = Array.from({ length: 256 }, () => 0.5);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ embedding: wrongLength }),
      });

      await expect(client.embed(validBuffer)).rejects.toThrow(
        'Embedding length 256, expected 768',
      );
    });

    it('should throw on non-OK HTTP response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Model is loading',
        statusText: 'Service Unavailable',
      });

      await expect(client.embed(validBuffer)).rejects.toThrow(
        'Embed request failed (HTTP 503): Model is loading',
      );
    });

    it('should throw on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(client.embed(validBuffer)).rejects.toThrow(
        'Inference service unavailable: ECONNREFUSED',
      );
    });

    it('should throw when embedding field is missing from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ error: 'something unexpected' }),
      });

      await expect(client.embed(validBuffer)).rejects.toThrow(
        'Embedding length 0, expected 768',
      );
    });
  });
});
