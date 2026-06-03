ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "telegramFirstName" TEXT,
  ADD COLUMN IF NOT EXISTS "telegramLastName" TEXT,
  ADD COLUMN IF NOT EXISTS "realFirstName" TEXT,
  ADD COLUMN IF NOT EXISTS "realLastName" TEXT;

UPDATE "users"
SET
  "realFirstName" = COALESCE("realFirstName", NULLIF("firstName", '')),
  "realLastName" = COALESCE("realLastName", NULLIF("lastName", ''))
WHERE "profileCompleted" = true;

INSERT INTO "system_settings" ("key", "value", "createdAt", "updatedAt")
VALUES
  ('mini_app_site_url', '""'::jsonb, NOW(), NOW()),
  ('mini_app_about_text', '"Prop Hub همراه هوشمند معامله‌گران برای دریافت کد تخفیف، بررسی پراپ فرم‌ها و مدیریت امتیازهاست."'::jsonb, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
