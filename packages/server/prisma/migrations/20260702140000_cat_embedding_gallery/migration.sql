-- Cat.embedding stored exactly one vector per cat, overwritten on every
-- rescan (VectorService.store did an UPDATE, not an INSERT). MegaDescriptor
-- re-ID embeddings are pose/angle-sensitive, so a single reference vector
-- makes matching fail whenever a rescan's pose/crop differs from whatever
-- was last stored — replacing it also destroyed the original reference.
--
-- Replace with a gallery table: every scan's embedding is kept (capped per
-- cat, see VectorService.store), and matching uses each cat's best (closest)
-- embedding across the whole gallery instead of a single overwritten vector.

CREATE TABLE "CatEmbedding" (
    "id" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_cat_embedding_catid" ON "CatEmbedding"("catId");
CREATE INDEX "idx_cat_embedding_gallery_hnsw" ON "CatEmbedding" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "CatEmbedding" ADD CONSTRAINT "CatEmbedding_catId_fkey"
  FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: carry forward each cat's existing single embedding as the first
-- entry in its gallery, so no re-identification history is lost.
INSERT INTO "CatEmbedding" ("id", "catId", "embedding", "createdAt")
SELECT gen_random_uuid(), "id", "embedding", "registeredAt"
FROM "Cat"
WHERE "embedding" IS NOT NULL;

-- Drop the now-superseded single-embedding column (its HNSW index,
-- idx_cat_embedding_hnsw, is dropped automatically along with the column).
ALTER TABLE "Cat" DROP COLUMN "embedding";
