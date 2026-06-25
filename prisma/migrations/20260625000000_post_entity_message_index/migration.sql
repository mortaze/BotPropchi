ALTER TABLE post_entities ADD COLUMN IF NOT EXISTS "messageIndex" INTEGER NOT NULL DEFAULT 0;

UPDATE post_entities SET "messageIndex" = 1 WHERE "postId" = 19;
