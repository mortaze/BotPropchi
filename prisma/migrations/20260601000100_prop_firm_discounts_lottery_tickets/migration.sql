-- Categorize discounts by prop firm only and store aggregated lottery tickets.
ALTER TABLE "discount_codes" DROP COLUMN IF EXISTS "category";
DROP TYPE IF EXISTS "DiscountCategory";

ALTER TABLE "lottery_entries"
  ADD COLUMN IF NOT EXISTS "ticketCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "pointsSpent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "chanceWeight" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "lottery_entries"
SET "ticketCount" = GREATEST("ticketCount", 1),
    "chanceWeight" = GREATEST("chanceWeight", "ticketCount", 1),
    "pointsSpent" = GREATEST("pointsSpent", 0);

CREATE INDEX IF NOT EXISTS "lottery_entries_lotteryId_ticketCount_idx" ON "lottery_entries"("lotteryId", "ticketCount");
