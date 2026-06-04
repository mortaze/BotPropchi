-- Create AI assistant status enum and tables
CREATE TYPE "AiChatStatus" AS ENUM ('SUCCESS', 'REJECTED_TOPIC', 'BLOCKED_INJECTION', 'RATE_LIMITED', 'ERROR');

ALTER TYPE "SystemEventType" ADD VALUE IF NOT EXISTS 'AI_CHAT';

CREATE TABLE "ai_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "systemPrompt" TEXT NOT NULL DEFAULT 'تو یک دستیار تخصصی فارسی‌زبان در حوزه پراپ فرم‌ها هستی. فقط درباره پراپ فرم‌ها، قوانین حساب‌ها، قوانین تریدینگ و کدهای تخفیف پاسخ بده.',
  "allowedSourceUrls" JSONB NOT NULL DEFAULT '[]',
  "fallbackMessage" TEXT NOT NULL DEFAULT 'این سوال خارج از محدوده سیستم است.',
  "topicFallbackMessage" TEXT NOT NULL DEFAULT '⚠️ این دستیار فقط برای سوالات مربوط به پراپ فرم‌ها و کدهای تخفیف فعال است.',
  "sourceFallbackMessage" TEXT NOT NULL DEFAULT 'اطلاعات این موضوع در منابع معتبر پراپ هاب موجود نیست.',
  "model" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
  "rateLimitPerHour" INTEGER NOT NULL DEFAULT 20,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_api_keys" (
  "id" SERIAL NOT NULL,
  "name" TEXT,
  "apiKey" TEXT NOT NULL,
  "keyPreview" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_chat_logs" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER,
  "telegramId" BIGINT,
  "message" TEXT NOT NULL,
  "response" TEXT,
  "status" "AiChatStatus" NOT NULL DEFAULT 'SUCCESS',
  "source" TEXT NOT NULL DEFAULT 'API',
  "error" TEXT,
  "aiApiKeyId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_chat_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_api_keys_isActive_idx" ON "ai_api_keys"("isActive");
CREATE INDEX "ai_chat_logs_userId_idx" ON "ai_chat_logs"("userId");
CREATE INDEX "ai_chat_logs_telegramId_idx" ON "ai_chat_logs"("telegramId");
CREATE INDEX "ai_chat_logs_status_idx" ON "ai_chat_logs"("status");
CREATE INDEX "ai_chat_logs_createdAt_idx" ON "ai_chat_logs"("createdAt");
ALTER TABLE "ai_chat_logs" ADD CONSTRAINT "ai_chat_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_chat_logs" ADD CONSTRAINT "ai_chat_logs_aiApiKeyId_fkey" FOREIGN KEY ("aiApiKeyId") REFERENCES "ai_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
