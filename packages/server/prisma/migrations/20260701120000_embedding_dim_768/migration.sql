-- Switch Cat.embedding from vector(512) to vector(768) for the self-hosted
-- MegaDescriptor-T-224 (Swin-Tiny) model, which outputs 768-dim embeddings.
-- Existing embeddings (mock-mode throwaway vectors) are dropped; cats keep their
-- rows but become re-identifiable again only after a real re-scan.
ALTER TABLE "Cat" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "Cat" ADD COLUMN "embedding" vector(768);
