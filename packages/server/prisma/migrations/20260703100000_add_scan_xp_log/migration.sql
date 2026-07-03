-- CreateTable
CREATE TABLE "ScanXpLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "xpAwarded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanXpLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanXpLog_userId_catId_createdAt_idx" ON "ScanXpLog"("userId", "catId", "createdAt");

-- AddForeignKey
ALTER TABLE "ScanXpLog" ADD CONSTRAINT "ScanXpLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanXpLog" ADD CONSTRAINT "ScanXpLog_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
