CREATE TYPE "RequiredChannelType" AS ENUM ('CHANNEL', 'GROUP');
CREATE TYPE "BroadcastType" AS ENUM ('TEXT', 'PHOTO', 'VIDEO', 'DOCUMENT', 'VOICE', 'AUDIO', 'STICKER', 'ANIMATION', 'MEDIA_GROUP');
CREATE TYPE "BroadcastParseMode" AS ENUM ('MARKDOWN', 'HTML');
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "BroadcastLogStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

ALTER TABLE "required_channels"
  ADD COLUMN "chatId" TEXT,
  ADD COLUMN "username" TEXT,
  ADD COLUMN "type" "RequiredChannelType" NOT NULL DEFAULT 'CHANNEL',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "required_channels"
SET "chatId" = "channelId",
    "username" = CASE WHEN "channelId" LIKE '@%' THEN REPLACE("channelId", '@', '') ELSE NULL END;

ALTER TABLE "referrals"
  ADD COLUMN "membershipVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "membershipVerificationStatus" TEXT NOT NULL DEFAULT 'VERIFIED';

CREATE TABLE "broadcasts" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "messageType" "BroadcastType" NOT NULL DEFAULT 'TEXT',
  "content" TEXT,
  "mediaFileId" TEXT,
  "mediaItems" JSONB,
  "parseMode" "BroadcastParseMode",
  "inlineKeyboard" JSONB,
  "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "broadcast_logs" (
  "id" SERIAL NOT NULL,
  "broadcastId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "telegramId" BIGINT NOT NULL,
  "status" "BroadcastLogStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "broadcast_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "required_channels_isActive_idx" ON "required_channels"("isActive");
CREATE INDEX "required_channels_type_idx" ON "required_channels"("type");
CREATE INDEX "broadcasts_status_idx" ON "broadcasts"("status");
CREATE INDEX "broadcasts_scheduledAt_idx" ON "broadcasts"("scheduledAt");
CREATE UNIQUE INDEX "broadcast_logs_broadcastId_userId_key" ON "broadcast_logs"("broadcastId", "userId");
CREATE INDEX "broadcast_logs_broadcastId_status_idx" ON "broadcast_logs"("broadcastId", "status");
CREATE INDEX "broadcast_logs_telegramId_idx" ON "broadcast_logs"("telegramId");

ALTER TABLE "broadcast_logs" ADD CONSTRAINT "broadcast_logs_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_logs" ADD CONSTRAINT "broadcast_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
