-- CreateTable
CREATE TABLE "MedicalRequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MedicalRequestEvent_requestId_createdAt_idx" ON "MedicalRequestEvent"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "MedicalRequestEvent" ADD CONSTRAINT "MedicalRequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MedicalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
