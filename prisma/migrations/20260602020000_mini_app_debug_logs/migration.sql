CREATE TABLE "mini_app_debug_logs" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,

    CONSTRAINT "mini_app_debug_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mini_app_debug_logs_telegramId_idx" ON "mini_app_debug_logs"("telegramId");
CREATE INDEX "mini_app_debug_logs_eventType_idx" ON "mini_app_debug_logs"("eventType");
CREATE INDEX "mini_app_debug_logs_userId_idx" ON "mini_app_debug_logs"("userId");
CREATE INDEX "mini_app_debug_logs_createdAt_idx" ON "mini_app_debug_logs"("createdAt");

ALTER TABLE "mini_app_debug_logs" ADD CONSTRAINT "mini_app_debug_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "menu_orders" ("key", "label", "href", "order", "ownerOnly", "featureKey") VALUES
('mini-app-logs','Mini App Logs','/dashboard/mini-app-logs',135,false,NULL)
ON CONFLICT ("key") DO NOTHING;
