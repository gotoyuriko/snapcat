import { config } from '../../config';

const EXPECTED_EMBEDDING_LENGTH = 512;

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
    if (!this.apiKey) {
      throw new Error('MegaDescriptor API key is not configured. Set MEGADESCRIPTOR_API_KEY environment variable.');
    }

    if (!croppedBuffer || croppedBuffer.length === 0) {
      throw new Error('croppedBuffer must be a non-empty Buffer');
    }

    let response: Response;
    try {
      response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(croppedBuffer),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`MegaDescriptor service unavailable: ${message}`);
    }

    if (response.status === 503) {
      throw new Error('MegaDescriptor service temporarily unavailable — please try again shortly');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `MegaDescriptor API error (HTTP ${response.status}): ${body || response.statusText}`,
      );
    }

    const json: unknown = await response.json();
    const embedding = this.parseEmbedding(json);

    if (embedding.length !== EXPECTED_EMBEDDING_LENGTH) {
      throw new Error(
        `MegaDescriptor returned embedding of length ${embedding.length}, expected ${EXPECTED_EMBEDDING_LENGTH}`,
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
