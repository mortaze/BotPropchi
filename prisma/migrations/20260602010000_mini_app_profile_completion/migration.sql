-- Add Telegram Mini App profile completion fields and rewards.
ALTER TABLE "users"
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "profileCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "profileCompletedAt" TIMESTAMP(3);

ALTER TYPE "PointLogType" ADD VALUE IF NOT EXISTS 'PROFILE_COMPLETION_REWARD';
ALTER TYPE "SystemEventType" ADD VALUE IF NOT EXISTS 'USER_PROFILE_COMPLETED';
ALTER TYPE "SystemEventType" ADD VALUE IF NOT EXISTS 'USER_PROFILE_UPDATED';

ALTER TABLE "scoring_settings"
  ADD COLUMN "profileCompletionPoints" INTEGER NOT NULL DEFAULT 50;

CREATE INDEX "users_profileCompleted_idx" ON "users"("profileCompleted");
CREATE INDEX "users_phoneNumber_idx" ON "users"("phoneNumber");
