import { RecognitionResult } from '@codingkitty/shared';

/**
 * TODO: Implement RecognitionService
 * - Orchestrate YOLO detection → MegaDescriptor embedding → pgvector search
 * - Return RecognitionResult discriminated union
 */

export class RecognitionService {
  async recognizeCat(_imageBuffer: Buffer): Promise<RecognitionResult> {
    // TODO: Call YOLO client for detection, then MegaDescriptor for embedding,
    // then vector service for similarity search
    throw new Error('Not implemented');
  }

  async storeEmbedding(_catId: string, _embedding: number[]): Promise<void> {
    // TODO: Store embedding in pgvector
    throw new Error('Not implemented');
  }
}
