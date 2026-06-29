-- Add media metadata fields to posts table
ALTER TABLE "posts" ADD COLUMN "media_file_unique_id" TEXT;
ALTER TABLE "posts" ADD COLUMN "media_caption" TEXT;
ALTER TABLE "posts" ADD COLUMN "media_mime_type" TEXT;
ALTER TABLE "posts" ADD COLUMN "media_meta" JSONB;
ALTER TABLE "posts" ADD COLUMN "reply_message_type" TEXT;
ALTER TABLE "posts" ADD COLUMN "reply_message_text" TEXT;
ALTER TABLE "posts" ADD COLUMN "reply_media_file_id" TEXT;
ALTER TABLE "posts" ADD COLUMN "reply_media_type" TEXT;
