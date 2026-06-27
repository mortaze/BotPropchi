-- Step 1: Clean orphaned post_keyboards where messageId references a deleted post_messages row
DELETE FROM "post_keyboards"
WHERE "messageId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "post_messages" WHERE "post_messages"."id" = "post_keyboards"."messageId"
  );

-- Step 2: Ensure messageId column exists on post_keyboards (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'post_keyboards' AND column_name = 'messageId'
  ) THEN
    ALTER TABLE "post_keyboards" ADD COLUMN "messageId" INTEGER;
  END IF;
END $$;

-- Step 3: Drop existing FK constraint if present (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'post_keyboards_messageId_fkey'
      AND table_name = 'post_keyboards'
  ) THEN
    ALTER TABLE "post_keyboards" DROP CONSTRAINT "post_keyboards_messageId_fkey";
  END IF;
END $$;

-- Step 4: Add ON DELETE CASCADE FK from post_keyboards.messageId → post_messages.id
ALTER TABLE "post_keyboards"
  ADD CONSTRAINT "post_keyboards_messageId_fkey"
  FOREIGN KEY ("messageId")
  REFERENCES "post_messages"("id")
  ON DELETE CASCADE;

-- Step 5: Add index on messageId for fast lookups
CREATE INDEX IF NOT EXISTS "post_keyboards_messageId_idx" ON "post_keyboards"("messageId");
