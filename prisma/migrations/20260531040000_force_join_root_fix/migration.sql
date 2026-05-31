ALTER TYPE "BotAdminRole" ADD VALUE IF NOT EXISTS 'MODERATOR';

ALTER TABLE "required_channels"
  ADD COLUMN IF NOT EXISTS "displayTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "buttonText" TEXT,
  ADD COLUMN IF NOT EXISTS "botStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "botStatusCheckedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastError" TEXT;

UPDATE "required_channels" SET "displayTitle" = "title" WHERE "displayTitle" IS NULL;

CREATE TABLE IF NOT EXISTS "user_required_channel_memberships" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "requiredChannelId" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_required_channel_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_required_channel_memberships_requiredChannelId_fkey" FOREIGN KEY ("requiredChannelId") REFERENCES "required_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_required_channel_memberships_userId_requiredChannelId_key" ON "user_required_channel_memberships"("userId", "requiredChannelId");
CREATE INDEX IF NOT EXISTS "user_required_channel_memberships_requiredChannelId_status_idx" ON "user_required_channel_memberships"("requiredChannelId", "status");
CREATE INDEX IF NOT EXISTS "user_required_channel_memberships_userId_status_idx" ON "user_required_channel_memberships"("userId", "status");
