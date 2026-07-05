-- Requirement 16: inactivity tracking & ownership revocation.
-- Existing owners start their inactivity clock at migration time.
ALTER TABLE "Ownership" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Ownership" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "Ownership" ADD COLUMN "inactivityWarnedAt" TIMESTAMP(3);
