ALTER TYPE "BroadcastType" ADD VALUE IF NOT EXISTS 'CONTACT';
ALTER TYPE "BroadcastType" ADD VALUE IF NOT EXISTS 'LOCATION';
ALTER TYPE "BroadcastType" ADD VALUE IF NOT EXISTS 'POLL';
ALTER TYPE "BroadcastType" ADD VALUE IF NOT EXISTS 'FORWARD_MESSAGE';

UPDATE "menu_orders" SET "isActive" = false WHERE "key" = 'broadcasts';
UPDATE "feature_toggles" SET "isEnabled" = false WHERE "key" = 'broadcasts';
