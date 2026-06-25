-- Fix NULL JSON and text fields for existing rows that were created as drafts
UPDATE "Post" SET
  "buttons" = '[]'::jsonb WHERE "buttons" IS NULL;
UPDATE "Post" SET
  "entities" = '[]'::jsonb WHERE "entities" IS NULL;
UPDATE "Post" SET
  "content" = '' WHERE "content" IS NULL;
UPDATE "Post" SET
  "previewText" = '' WHERE "previewText" IS NULL;
UPDATE "Post" SET
  "rawContent" = '' WHERE "rawContent" IS NULL;
UPDATE "Post" SET
  "renderedContent" = '' WHERE "renderedContent" IS NULL;
UPDATE "Post" SET
  "renderMode" = 'telegram_entities' WHERE "renderMode" IS NULL;
