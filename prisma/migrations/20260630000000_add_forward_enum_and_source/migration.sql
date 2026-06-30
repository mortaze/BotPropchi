-- Add 'forward' to PostMessageType enum
ALTER TYPE "PostMessageType" ADD VALUE IF NOT EXISTS 'forward';

-- Add forward_source column to post_messages
ALTER TABLE "post_messages" ADD COLUMN "forward_source" JSONB;
