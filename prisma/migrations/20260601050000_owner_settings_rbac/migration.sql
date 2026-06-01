ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'OWNER';

ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "admins" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "admins_email_key" ON "admins"("email");

CREATE TABLE IF NOT EXISTS "system_settings" (
  "id" SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "menu_orders" (
  "id" SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "ownerOnly" BOOLEAN NOT NULL DEFAULT false,
  "featureKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "menu_orders_order_idx" ON "menu_orders"("order");

CREATE TABLE IF NOT EXISTS "feature_toggles" (
  "id" SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "menu_orders" ("key", "label", "href", "order", "ownerOnly", "featureKey") VALUES
('dashboard','داشبورد','/dashboard',10,false,NULL),
('users','کاربران','/dashboard/users',20,false,NULL),
('lotteries','قرعه‌کشی‌ها','/dashboard/lotteries',30,false,'lottery'),
('discounts','تخفیف‌ها','/dashboard/discounts',40,false,'discount_codes'),
('prop-firms','پراپ فرم‌ها','/dashboard/prop-firms',50,false,'prop_firms'),
('referrals','دعوت دوستان','/dashboard/referrals',60,false,'referrals'),
('required-channels','عضویت اجباری','/dashboard/required-channels',70,false,'force_join'),
('groups','مدیریت گروه‌ها','/dashboard/groups',80,false,'groups'),
('keyword-replies','پاسخ‌های خودکار','/dashboard/keyword-replies',90,false,'auto_replies'),
('broadcasts','پیام همگانی','/dashboard/broadcasts',100,false,'broadcasts'),
('bot-admins','ادمین‌های ربات','/dashboard/bot-admins',110,false,NULL),
('admin-users','مدیریت ادمین‌ها','/dashboard/admin-users',115,true,NULL),
('analytics','گزارشات','/dashboard/analytics',120,false,'reports'),
('system-logs','لاگ سیستم','/dashboard/system-logs',130,false,NULL),
('settings','⚙️ تنظیمات','/dashboard/settings',140,true,NULL)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "feature_toggles" ("key", "label", "isEnabled") VALUES
('discount_codes','کدهای تخفیف',true),
('lottery','قرعه کشی',true),
('referrals','دعوت دوستان',true),
('force_join','عضویت اجباری',true),
('broadcasts','پیام همگانی',true),
('auto_replies','پاسخ خودکار',true),
('reports','گزارشات',true),
('groups','مدیریت گروه‌ها',true),
('leaderboard','لیدربورد',true),
('points','امتیازدهی',true),
('prop_firms','پراپ فرم‌ها',true)
ON CONFLICT ("key") DO NOTHING;
