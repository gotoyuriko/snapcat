/**
 * TODO: Implement Vector Service (pgvector)
 * - Store and query cat embeddings using pgvector
 * - Perform approximate nearest neighbor (ANN) search
 * - Return similarity scores for cat re-identification
 */

export interface VectorSearchResult {
  catId: string;
  distance: number;
}

export class VectorService {
  async store(_catId: string, _embedding: number[]): Promise<void> {
    // TODO: INSERT embedding into pgvector table
    throw new Error('Not implemented');
  }

  async searchNearest(_embedding: number[], _limit: number, _threshold: number): Promise<VectorSearchResult[]> {
    // TODO: Query pgvector for nearest neighbors using cosine distance
    throw new Error('Not implemented');
  }
}
