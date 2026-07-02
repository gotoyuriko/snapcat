import { PrismaClient } from '@prisma/client';

export interface VectorSearchResult {
  catId: string;
  distance: number;
}

export interface FindNearestCatResult {
  catId: string;
  similarity: number;
}

/**
 * Max embeddings retained per cat's gallery — oldest pruned on insert. Keeps
 * table/index size bounded without needing a background job.
 */
const MAX_EMBEDDINGS_PER_CAT = 20;

export class VectorService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Add a new embedding to a cat's gallery (CatEmbedding) — does NOT
   * overwrite prior scans. Re-ID embeddings are pose/angle-sensitive, so
   * keeping every scan and matching against the best of them is far more
   * robust than a single reference vector that gets replaced each rescan.
   * Uses raw SQL because Prisma doesn't natively support pgvector types.
   */
  async store(catId: string, embedding: number[]): Promise<void> {
    const vectorStr = `[${embedding.join(',')}]`;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "CatEmbedding" (id, "catId", embedding, "createdAt")
       VALUES (gen_random_uuid(), $1, $2::vector, now())`,
      catId,
      vectorStr,
    );

    // Prune oldest entries beyond the cap so the gallery doesn't grow unbounded.
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "CatEmbedding"
       WHERE "catId" = $1
         AND id NOT IN (
           SELECT id FROM "CatEmbedding"
           WHERE "catId" = $1
           ORDER BY "createdAt" DESC
           LIMIT $2
         )`,
      catId,
      MAX_EMBEDDINGS_PER_CAT,
    );
  }

  /**
   * Find the nearest cats by cosine similarity, matching each cat by the
   * BEST (closest) embedding in its gallery rather than a single vector —
   * so a match succeeds if ANY past scan resembles the new photo, not just
   * whichever pose happened to be stored most recently.
   * Uses pgvector's <=> operator (cosine distance) and converts to similarity (1 - distance).
   * Returns the top-3 matches ordered by highest similarity first.
   */
  async findNearestCat(embedding: number[]): Promise<FindNearestCatResult[]> {
    const vectorStr = `[${embedding.join(',')}]`;
    const results = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; distance: number }>
    >(
      `SELECT id, distance FROM (
         SELECT DISTINCT ON ("catId") "catId" AS id, (embedding <=> $1::vector) AS distance
         FROM "CatEmbedding"
         WHERE embedding IS NOT NULL
         ORDER BY "catId", distance ASC
       ) best_per_cat
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
   * Search for nearest neighbours (best embedding per cat) with a
   * configurable limit and distance threshold. Kept for backward
   * compatibility with the original interface.
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
      `SELECT id, distance FROM (
         SELECT DISTINCT ON ("catId") "catId" AS id, (embedding <=> $1::vector) AS distance
         FROM "CatEmbedding"
         WHERE embedding IS NOT NULL
         ORDER BY "catId", distance ASC
       ) best_per_cat
       WHERE distance <= $2
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
