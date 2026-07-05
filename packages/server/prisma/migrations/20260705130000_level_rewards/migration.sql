-- Requirement 17: level rewards — one grant per user–cat–level, plus
-- single-use discount coupons with a minimum purchase and 30-day expiry.
CREATE TABLE "LevelRewardGrant" (
    "userId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelRewardGrant_pkey" PRIMARY KEY ("userId", "catId", "level")
);

CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountOffCents" INTEGER NOT NULL,
    "minPurchaseCents" INTEGER NOT NULL,
    "grantedForCatId" TEXT,
    "grantedAtLevel" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LevelRewardGrant" ADD CONSTRAINT "LevelRewardGrant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LevelRewardGrant" ADD CONSTRAINT "LevelRewardGrant_catId_fkey"
    FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
