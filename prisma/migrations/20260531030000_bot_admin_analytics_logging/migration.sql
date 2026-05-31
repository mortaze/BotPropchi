-- Bot in-telegram admin panel, force-join lifecycle, analytics/logging.
CREATE TYPE "RequiredChannelStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISABLED');
CREATE TYPE "BotAdminRole" AS ENUM ('OWNER', 'SUPER_ADMIN', 'ADMIN');
CREATE TYPE "BotAdminStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "SystemEventType" AS ENUM ('USER_LOGIN', 'FORCE_JOIN', 'REFERRAL', 'BROADCAST', 'LOTTERY', 'DISCOUNT_CLICK', 'ERROR', 'ADMIN_ACTION', 'GROUP_INTEGRATION');
CREATE TYPE "SystemLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

ALTER TABLE "required_channels"
  ADD COLUMN "status" "RequiredChannelStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "disabledAt" TIMESTAMP(3);

ALTER TYPE "BroadcastType" ADD VALUE IF NOT EXISTS 'COPY_MESSAGE';

CREATE TABLE "bot_admins" (
  "id" SERIAL NOT NULL,
  "telegramId" BIGINT NOT NULL,
  "username" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "role" "BotAdminRole" NOT NULL DEFAULT 'ADMIN',
  "status" "BotAdminStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bot_admins_telegramId_key" ON "bot_admins"("telegramId");
CREATE INDEX "bot_admins_status_idx" ON "bot_admins"("status");
CREATE INDEX "bot_admins_role_idx" ON "bot_admins"("role");

CREATE TABLE "system_logs" (
  "id" SERIAL NOT NULL,
  "eventType" "SystemEventType" NOT NULL,
  "level" "SystemLogLevel" NOT NULL DEFAULT 'INFO',
  "message" TEXT NOT NULL,
  "userId" INTEGER,
  "telegramId" BIGINT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "system_logs_eventType_idx" ON "system_logs"("eventType");
CREATE INDEX "system_logs_level_idx" ON "system_logs"("level");
CREATE INDEX "system_logs_userId_idx" ON "system_logs"("userId");
CREATE INDEX "system_logs_telegramId_idx" ON "system_logs"("telegramId");
CREATE INDEX "system_logs_createdAt_idx" ON "system_logs"("createdAt");
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "required_channels_status_idx" ON "required_channels"("status");
