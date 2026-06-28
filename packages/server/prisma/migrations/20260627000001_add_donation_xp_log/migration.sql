-- CreateTable
CREATE TABLE "DonationXpLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "xpAwarded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonationXpLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DonationXpLog_userId_catId_createdAt_idx" ON "DonationXpLog"("userId", "catId", "createdAt");

-- AddForeignKey
ALTER TABLE "DonationXpLog" ADD CONSTRAINT "DonationXpLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationXpLog" ADD CONSTRAINT "DonationXpLog_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
