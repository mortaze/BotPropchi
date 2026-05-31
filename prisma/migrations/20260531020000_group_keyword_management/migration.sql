CREATE TYPE "TelegramGroupStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISABLED');
CREATE TYPE "KeywordReplyResponseType" AS ENUM ('TEXT', 'PHOTO', 'DOCUMENT');

CREATE TABLE "telegram_groups" (
  "id" SERIAL NOT NULL,
  "chatId" BIGINT NOT NULL,
  "title" TEXT NOT NULL,
  "username" TEXT,
  "status" "TelegramGroupStatus" NOT NULL DEFAULT 'PENDING',
  "botIsAdmin" BOOLEAN NOT NULL DEFAULT false,
  "botAdminCheckedAt" TIMESTAMP(3),
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "keyword_replies" (
  "id" SERIAL NOT NULL,
  "keyword" TEXT NOT NULL,
  "response" TEXT,
  "responseType" "KeywordReplyResponseType" NOT NULL DEFAULT 'TEXT',
  "parseMode" "BroadcastParseMode",
  "mediaFileId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "keyword_replies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "keyword_reply_logs" (
  "id" SERIAL NOT NULL,
  "keywordReplyId" INTEGER NOT NULL,
  "telegramGroupId" INTEGER NOT NULL,
  "userTelegramId" BIGINT NOT NULL,
  "messageId" INTEGER NOT NULL,
  "matchedText" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "keyword_reply_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_groups_chatId_key" ON "telegram_groups"("chatId");
CREATE INDEX "telegram_groups_status_idx" ON "telegram_groups"("status");
CREATE INDEX "telegram_groups_botIsAdmin_idx" ON "telegram_groups"("botIsAdmin");
CREATE INDEX "keyword_replies_isActive_idx" ON "keyword_replies"("isActive");
CREATE INDEX "keyword_replies_keyword_idx" ON "keyword_replies"("keyword");
CREATE INDEX "keyword_reply_logs_keywordReplyId_idx" ON "keyword_reply_logs"("keywordReplyId");
CREATE INDEX "keyword_reply_logs_telegramGroupId_idx" ON "keyword_reply_logs"("telegramGroupId");
CREATE INDEX "keyword_reply_logs_createdAt_idx" ON "keyword_reply_logs"("createdAt");
ALTER TABLE "keyword_reply_logs" ADD CONSTRAINT "keyword_reply_logs_keywordReplyId_fkey" FOREIGN KEY ("keywordReplyId") REFERENCES "keyword_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "keyword_reply_logs" ADD CONSTRAINT "keyword_reply_logs_telegramGroupId_fkey" FOREIGN KEY ("telegramGroupId") REFERENCES "telegram_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
