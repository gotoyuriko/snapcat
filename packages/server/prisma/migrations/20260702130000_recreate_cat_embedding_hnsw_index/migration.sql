-- The 20260701120000_embedding_dim_768 migration dropped and re-added
-- Cat.embedding to widen it to vector(768); dropping the column also
-- silently dropped its HNSW index (idx_cat_embedding_hnsw) without
-- recreating it, leaving vector similarity search (findNearestCat) doing a
-- full sequential scan. Recreate it.
CREATE INDEX IF NOT EXISTS "idx_cat_embedding_hnsw" ON "Cat" USING hnsw ("embedding" vector_cosine_ops);
