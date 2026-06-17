-- Repair a previously generated migration that contained mojibake question-mark defaults.
-- Existing customized rows are preserved; only values still equal to the corrupted placeholders are replaced.
ALTER TABLE "force_join_settings"
  ALTER COLUMN "title" SET DEFAULT 'عضویت اجباری',
  ALTER COLUMN "welcomeMessage" SET DEFAULT 'برای استفاده از ربات ابتدا در کانال‌های زیر عضو شوید',
  ALTER COLUMN "notJoinedMessage" SET DEFAULT 'هنوز در همه کانال‌ها عضو نشده‌اید',
  ALTER COLUMN "joinButtonText" SET DEFAULT 'عضویت',
  ALTER COLUMN "checkMembershipButtonText" SET DEFAULT 'بررسی عضویت',
  ALTER COLUMN "successJoinMessage" SET DEFAULT 'عضویت شما تایید شد ✅',
  ALTER COLUMN "errorMessage" SET DEFAULT 'خطا در بررسی عضویت',
  ALTER COLUMN "retryMessage" SET DEFAULT 'دوباره تلاش کنید',
  ALTER COLUMN "emptyChannelsMessage" SET DEFAULT 'فعلاً کانالی تعریف نشده است';

UPDATE "force_join_settings"
SET
  "title" = CASE WHEN "title" LIKE '%???%' OR "title" LIKE '%????%' THEN 'عضویت اجباری' ELSE "title" END,
  "welcomeMessage" = CASE WHEN "welcomeMessage" LIKE '%???%' OR "welcomeMessage" LIKE '%????%' THEN 'برای استفاده از ربات ابتدا در کانال‌های زیر عضو شوید' ELSE "welcomeMessage" END,
  "notJoinedMessage" = CASE WHEN "notJoinedMessage" LIKE '%???%' OR "notJoinedMessage" LIKE '%????%' THEN 'هنوز در همه کانال‌ها عضو نشده‌اید' ELSE "notJoinedMessage" END,
  "joinButtonText" = CASE WHEN "joinButtonText" LIKE '%???%' OR "joinButtonText" LIKE '%????%' THEN 'عضویت' ELSE "joinButtonText" END,
  "checkMembershipButtonText" = CASE WHEN "checkMembershipButtonText" LIKE '%???%' OR "checkMembershipButtonText" LIKE '%????%' THEN 'بررسی عضویت' ELSE "checkMembershipButtonText" END,
  "successJoinMessage" = CASE WHEN "successJoinMessage" LIKE '%???%' OR "successJoinMessage" LIKE '%????%' THEN 'عضویت شما تایید شد ✅' ELSE "successJoinMessage" END,
  "errorMessage" = CASE WHEN "errorMessage" LIKE '%???%' OR "errorMessage" LIKE '%????%' THEN 'خطا در بررسی عضویت' ELSE "errorMessage" END,
  "retryMessage" = CASE WHEN "retryMessage" LIKE '%???%' OR "retryMessage" LIKE '%????%' THEN 'دوباره تلاش کنید' ELSE "retryMessage" END,
  "emptyChannelsMessage" = CASE WHEN "emptyChannelsMessage" LIKE '%???%' OR "emptyChannelsMessage" LIKE '%????%' THEN 'فعلاً کانالی تعریف نشده است' ELSE "emptyChannelsMessage" END,
  "updatedAt" = NOW()
WHERE
  "title" LIKE '%???%' OR "title" LIKE '%????%' OR
  "welcomeMessage" LIKE '%???%' OR "welcomeMessage" LIKE '%????%' OR
  "notJoinedMessage" LIKE '%???%' OR "notJoinedMessage" LIKE '%????%' OR
  "joinButtonText" LIKE '%???%' OR "joinButtonText" LIKE '%????%' OR
  "checkMembershipButtonText" LIKE '%???%' OR "checkMembershipButtonText" LIKE '%????%' OR
  "successJoinMessage" LIKE '%???%' OR "successJoinMessage" LIKE '%????%' OR
  "errorMessage" LIKE '%???%' OR "errorMessage" LIKE '%????%' OR
  "retryMessage" LIKE '%???%' OR "retryMessage" LIKE '%????%' OR
  "emptyChannelsMessage" LIKE '%???%' OR "emptyChannelsMessage" LIKE '%????%';
