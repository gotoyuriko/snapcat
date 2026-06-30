import { config } from '../../config';

// MegaDescriptor-T-224 (Swin-Tiny) outputs a 768-dim embedding.
const EXPECTED_EMBEDDING_LENGTH = 768;

/** Small seeded PRNG (deterministic given the seed). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mock embedding for RECOGNITION_MOCK: a deterministic unit-length 512-dim
 * vector seeded from the image bytes. The same photo embeds identically (so a
 * re-scan of the exact image matches), while different photos diverge.
 */
function mockEmbedding(buf: Buffer): Float32Array {
  let seed = 0x811c9dc5; // FNV-1a offset basis
  const step = Math.max(1, Math.floor(buf.length / 4096));
  for (let i = 0; i < buf.length; i += step) {
    seed = Math.imul(seed ^ buf[i], 0x01000193) >>> 0;
  }
  const rand = mulberry32(seed);
  const v = new Float32Array(EXPECTED_EMBEDDING_LENGTH);
  let norm = 0;
  for (let i = 0; i < EXPECTED_EMBEDDING_LENGTH; i++) {
    const x = rand() * 2 - 1;
    v[i] = x;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < EXPECTED_EMBEDDING_LENGTH; i++) v[i] /= norm;
  return v;
}

/**
 * MegaDescriptor client for wildlife re-identification.
 * Calls HuggingFace Inference API to generate a 512-dim embedding
 * from a cropped cat image buffer.
 */
export class MegaDescriptorClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(
    apiUrl: string = config.megadescriptor.apiUrl,
    apiKey: string = config.megadescriptor.apiKey,
  ) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  /**
   * Generate a 512-dimensional embedding vector from a cropped cat image.
   *
   * @param croppedBuffer - Image buffer of the cropped cat (JPEG/PNG)
   * @returns Float32Array of 512 elements representing the cat embedding
   * @throws Error if API key is missing, service is unavailable, or vector length is invalid
   */
  async embed(croppedBuffer: Buffer): Promise<Float32Array> {
    if (!croppedBuffer || croppedBuffer.length === 0) {
      throw new Error('croppedBuffer must be a non-empty Buffer');
    }

    if (config.recognitionMock) {
      // Mock mode: deterministic embedding from the image bytes, no HF call.
      return mockEmbedding(croppedBuffer);
    }

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(croppedBuffer)]), 'crop.jpg');

    let response: Response;
    try {
      response = await fetch(`${config.inference.url}/embed`, {
        method: 'POST',
        body: form,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Inference service unavailable: ${message}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Embed request failed (HTTP ${response.status}): ${body || response.statusText}`,
      );
    }

    const json = (await response.json()) as { embedding?: number[] };
    const embedding = json.embedding ?? [];

    if (embedding.length !== EXPECTED_EMBEDDING_LENGTH) {
      throw new Error(
        `Embedding length ${embedding.length}, expected ${EXPECTED_EMBEDDING_LENGTH}`,
      );
    }

    return new Float32Array(embedding);
  }

  /**
   * Parse the HuggingFace inference response to extract a flat number array.
   * HuggingFace feature-extraction models can return:
   *   - number[] (flat array)
   *   - number[][] (batch of embeddings — take first)
   */
  private parseEmbedding(json: unknown): number[] {
    if (Array.isArray(json)) {
      // Flat array of numbers: [0.1, 0.2, ...]
      if (json.length > 0 && typeof json[0] === 'number') {
        return json as number[];
      }
      // Nested array: [[0.1, 0.2, ...]] — batch response, take first element
      if (json.length > 0 && Array.isArray(json[0])) {
        const first = json[0] as unknown[];
        if (first.length > 0 && typeof first[0] === 'number') {
          return first as number[];
        }
      }
    }

    throw new Error(
      'MegaDescriptor returned an unexpected response format. Expected a numeric array.',
    );
  }
}
