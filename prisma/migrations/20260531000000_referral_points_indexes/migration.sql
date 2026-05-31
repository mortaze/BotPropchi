-- Improve referral and point-history query performance without changing existing data.
CREATE INDEX IF NOT EXISTS "users_referredById_idx" ON "users"("referredById");
CREATE INDEX IF NOT EXISTS "point_logs_userId_idx" ON "point_logs"("userId");
CREATE INDEX IF NOT EXISTS "point_logs_type_idx" ON "point_logs"("type");
