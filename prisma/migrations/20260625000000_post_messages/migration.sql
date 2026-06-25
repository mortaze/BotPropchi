CREATE TYPE "PostMessageType" AS ENUM ('text', 'photo', 'video', 'document', 'audio', 'voice', 'animation', 'sticker', 'album');
CREATE TYPE "PostMessageParseMode" AS ENUM ('None', 'MarkdownV2', 'HTML');

CREATE TABLE "post_messages" (
  "id" SERIAL PRIMARY KEY,
  "post_id" INTEGER NOT NULL,
  "order" INTEGER NOT NULL,
  "message_type" "PostMessageType" NOT NULL DEFAULT 'text',
  "text" TEXT,
  "entities" JSONB NOT NULL DEFAULT '[]',
  "parse_mode" "PostMessageParseMode" NOT NULL DEFAULT 'None',
  "media_file_id" TEXT,
  "media_group_id" TEXT,
  "caption" TEXT,
  "caption_entities" JSONB NOT NULL DEFAULT '[]',
  "reply_markup" JSONB,
  "delay_ms" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_messages_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "post_messages_post_id_order_key" ON "post_messages"("post_id", "order");
CREATE INDEX "post_messages_post_id_idx" ON "post_messages"("post_id");
