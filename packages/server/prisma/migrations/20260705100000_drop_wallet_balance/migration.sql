-- Requirement 10 rework: no in-app wallet — purchases pay the exact amount
-- at checkout via the payment gateway; inventory is credited on webhook.
ALTER TABLE "User" DROP COLUMN "walletBalance";
