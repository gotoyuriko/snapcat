import { PrismaClient } from '@prisma/client';

export interface VectorSearchResult {
  catId: string;
  distance: number;
}

export interface FindNearestCatResult {
  catId: string;
  similarity: number;
}

export class VectorService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Store or update a cat's embedding vector in the database.
   * Uses raw SQL because Prisma doesn't natively support pgvector types.
   */
  async store(catId: string, embedding: number[]): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.prisma.$executeRawUnsafe(
      `UPDATE "Cat" SET embedding = $1::vector WHERE id = $2`,
      vectorStr,
      catId,
    );
  }

  /**
   * Find the nearest cats by cosine similarity.
   * Uses pgvector's <=> operator (cosine distance) and converts to similarity (1 - distance).
   * Returns the top-3 matches ordered by highest similarity first.
   */
  async findNearestCat(embedding: number[]): Promise<FindNearestCatResult[]> {
    const vectorStr = `[${embedding.join(',')}]`;
    const results = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; distance: number }>
    >(
      `SELECT id, (embedding <=> $1::vector) AS distance
       FROM "Cat"
       WHERE embedding IS NOT NULL
       ORDER BY distance ASC
       LIMIT 3`,
      vectorStr,
    );

    return results.map((row) => ({
      catId: row.id,
      similarity: 1 - row.distance,
    }));
  }

  /**
   * Search for nearest neighbours with a configurable limit and distance threshold.
   * Kept for backward compatibility with the original interface.
   */
  async searchNearest(
    embedding: number[],
    limit: number,
    threshold: number,
  ): Promise<VectorSearchResult[]> {
    const vectorStr = `[${embedding.join(',')}]`;
    const results = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; distance: number }>
    >(
      `SELECT id, (embedding <=> $1::vector) AS distance
       FROM "Cat"
       WHERE embedding IS NOT NULL
         AND (embedding <=> $1::vector) <= $2
       ORDER BY distance ASC
       LIMIT $3`,
      vectorStr,
      threshold,
      limit,
    );

    return results.map((row) => ({
      catId: row.id,
      distance: row.distance,
    }));
  }
}
