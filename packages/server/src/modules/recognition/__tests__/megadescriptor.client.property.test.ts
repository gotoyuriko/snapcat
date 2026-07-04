import fc from 'fast-check';
import { MegaDescriptorClient } from '../megadescriptor.client';

/**
 * Property 8: Embedding dimensionality consistency
 * Validates: Requirements 4.1
 *
 * For any non-empty image buffer passed to embed(), the returned vector
 * has exactly 768 dimensions when the API returns a valid response.
 * (MegaDescriptor-T-224 uses Swin-Tiny which outputs 768-dim embeddings)
 */

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('MegaDescriptorClient - Property Tests', () => {
  const TEST_API_URL = 'http://localhost:8000';
  const TEST_API_KEY = 'hf_test_key_123';
  let client: MegaDescriptorClient;

  beforeEach(() => {
    client = new MegaDescriptorClient(TEST_API_URL, TEST_API_KEY);
    mockFetch.mockReset();
  });

  it('should always return a Float32Array with exactly 768 dimensions for any non-empty buffer', async () => {
    /**
     * **Validates: Requirements 4.1**
     *
     * Property: For any arbitrary non-empty image buffer, when the inference
     * service returns a successful 768-element embedding, embed() returns a
     * Float32Array of length exactly 768.
     */
    const valid768Embedding = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 0.5);

    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary non-empty Buffers of various sizes (1 to 10000 bytes)
        fc.uint8Array({ minLength: 1, maxLength: 10000 }).map(arr => Buffer.from(arr)),
        async (buffer) => {
          // Mock fetch to return a valid 768-element embedding for every call
          mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ embedding: valid768Embedding }),
          });

          const result = await client.embed(buffer);

          // The result must be a Float32Array with exactly 768 elements
          expect(result).toBeInstanceOf(Float32Array);
          expect(result.length).toBe(768);
        },
      ),
      { numRuns: 20 },
    );
  });
});
