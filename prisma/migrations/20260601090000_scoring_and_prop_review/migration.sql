-- Safe additive migration: central scoring settings and optional prop-firm review link.
ALTER TABLE "prop_firms" ADD COLUMN IF NOT EXISTS "reviewLink" TEXT;

CREATE TABLE IF NOT EXISTS "scoring_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "startPoints" INTEGER NOT NULL DEFAULT 0,
  "channelJoinPoints" INTEGER NOT NULL DEFAULT 0,
  "futureActivityPoints" INTEGER NOT NULL DEFAULT 0,
  "dailyActivityPoints" INTEGER NOT NULL DEFAULT 5,
  "linkClickPoints" INTEGER NOT NULL DEFAULT 2,
  "referralRewardPoints" INTEGER NOT NULL DEFAULT 20,
  "welcomeMessageText" TEXT NOT NULL DEFAULT 'سلام {name} عزیز! 👋\n\n🎯 به ربات کدهای تخفیف پراپ فرم خوش آمدید\n\nاز منوی زیر انتخاب کنید:',
  "initialPointsMessageText" TEXT NOT NULL DEFAULT '🎁 {points} امتیاز اولیه به حساب شما اضافه شد.',
  "isWelcomeMessageEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scoring_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "scoring_settings" ("id") VALUES (1)
ON CONFLICT ("id") DO NOTHING;
