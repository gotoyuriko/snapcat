-- CreateExtension: PostGIS
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension: pgvector
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable: User
CREATE TABLE "User" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "walletBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Cat
CREATE TABLE "Cat" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "embedding" vector(512),
    "embeddingRef" TEXT NOT NULL DEFAULT '',
    "firstDiscovererId" TEXT NOT NULL,
    "lastKnownApproxLat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastKnownApproxLng" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "photoUrl" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cat_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserCatDiscovery
CREATE TABLE "UserCatDiscovery" (
    "userId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCatDiscovery_pkey" PRIMARY KEY ("userId","catId")
);

-- CreateTable: Ownership
CREATE TABLE "Ownership" (
    "userId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ownership_pkey" PRIMARY KEY ("userId","catId")
);

-- CreateTable: Sighting
CREATE TABLE "Sighting" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "catId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fuzzedLat" DOUBLE PRECISION NOT NULL,
    "fuzzedLng" DOUBLE PRECISION NOT NULL,
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'scan',

    CONSTRAINT "Sighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Donation
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "donorId" TEXT NOT NULL,
    "catId" TEXT NOT NULL,
    "foodItemId" TEXT,
    "foodItem" TEXT NOT NULL DEFAULT '',
    "amountCents" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'wallet',
    "workflowId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MedicalRequest
CREATE TABLE "MedicalRequest" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "catId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'medical',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "partnerId" TEXT,
    "workflowId" TEXT NOT NULL DEFAULT '',
    "documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChatMessage
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "catId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Partner
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'vet',
    "contactEmail" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable: FoodItem
CREATE TABLE "FoodItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,

    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserInventory
CREATE TABLE "UserInventory" (
    "userId" TEXT NOT NULL,
    "foodItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserInventory_pkey" PRIMARY KEY ("userId","foodItemId")
);

-- CreateIndex: User email unique
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex: Geo-index on Cat approximate location
CREATE INDEX "idx_cat_approx_location" ON "Cat"("lastKnownApproxLat", "lastKnownApproxLng");

-- CreateIndex: pgvector HNSW index on Cat.embedding for cosine similarity search
CREATE INDEX "idx_cat_embedding_hnsw" ON "Cat" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex: Geo-index on Sighting fuzzed coordinates
CREATE INDEX "idx_sighting_fuzzed_geo" ON "Sighting"("fuzzedLat", "fuzzedLng");

-- AddForeignKey: Cat.firstDiscovererId -> User.id
ALTER TABLE "Cat" ADD CONSTRAINT "Cat_firstDiscovererId_fkey" FOREIGN KEY ("firstDiscovererId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: UserCatDiscovery.userId -> User.id
ALTER TABLE "UserCatDiscovery" ADD CONSTRAINT "UserCatDiscovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: UserCatDiscovery.catId -> Cat.id
ALTER TABLE "UserCatDiscovery" ADD CONSTRAINT "UserCatDiscovery_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Ownership.userId -> User.id
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Ownership.catId -> Cat.id
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Ownership.(userId,catId) -> UserCatDiscovery.(userId,catId)
-- Enforces Requirement 14.3: Ownership row can only exist if a matching UserCatDiscovery row exists
ALTER TABLE "Ownership" ADD CONSTRAINT "Ownership_userId_catId_fkey" FOREIGN KEY ("userId", "catId") REFERENCES "UserCatDiscovery"("userId", "catId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Sighting.catId -> Cat.id
ALTER TABLE "Sighting" ADD CONSTRAINT "Sighting_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Sighting.reporterId -> User.id
ALTER TABLE "Sighting" ADD CONSTRAINT "Sighting_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Donation.donorId -> User.id
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Donation.catId -> Cat.id
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Donation.foodItemId -> FoodItem.id
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: MedicalRequest.catId -> Cat.id
ALTER TABLE "MedicalRequest" ADD CONSTRAINT "MedicalRequest_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: MedicalRequest.requesterId -> User.id
ALTER TABLE "MedicalRequest" ADD CONSTRAINT "MedicalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: MedicalRequest.partnerId -> Partner.id
ALTER TABLE "MedicalRequest" ADD CONSTRAINT "MedicalRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: ChatMessage.catId -> Cat.id
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_catId_fkey" FOREIGN KEY ("catId") REFERENCES "Cat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ChatMessage.senderId -> User.id
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: UserInventory.userId -> User.id
ALTER TABLE "UserInventory" ADD CONSTRAINT "UserInventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: UserInventory.foodItemId -> FoodItem.id
ALTER TABLE "UserInventory" ADD CONSTRAINT "UserInventory_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
