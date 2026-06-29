-- Add forward source fields for copyMessage/forwardMessage delivery
ALTER TABLE "posts" ADD COLUMN "forward_source_chat_id" BIGINT;
ALTER TABLE "posts" ADD COLUMN "forward_source_message_id" INTEGER;
