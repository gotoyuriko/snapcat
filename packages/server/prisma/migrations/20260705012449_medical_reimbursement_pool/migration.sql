-- AlterTable
ALTER TABLE "MedicalRequest" ADD COLUMN     "amountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reimbursedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;
