-- Add forward detection fields to posts table
ALTER TABLE "posts" ADD COLUMN "is_forwarded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "posts" ADD COLUMN "forward_meta" JSONB;
