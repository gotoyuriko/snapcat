-- DropIndex
DROP INDEX "idx_cat_embedding_gallery_hnsw";

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "photoUrl" TEXT;

-- RenameIndex
ALTER INDEX "idx_cat_embedding_catid" RENAME TO "CatEmbedding_catId_idx";
