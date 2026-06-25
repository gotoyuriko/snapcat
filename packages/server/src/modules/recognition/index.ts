import { RecognitionResult } from '@codingkitty/shared';

/**
 * Recognition Module
 * Handles cat detection (YOLO) and re-identification (MegaDescriptor + pgvector).
 */

export interface RecognitionModule {
  /** Process an image and return detection + identification results */
  recognizeCat(imageBuffer: Buffer): Promise<RecognitionResult>;
  /** Store a new cat embedding in the vector database */
  storeEmbedding(catId: string, embedding: number[]): Promise<void>;
  /** Search for similar embeddings by vector distance */
  searchSimilar(embedding: number[], threshold: number): Promise<Array<{ catId: string; distance: number }>>;
}

export { RecognitionService } from './recognition.service';
export { RecognitionController } from './recognition.controller';
export { recognitionRoutes } from './recognition.routes';
