ALTER TABLE "posts" ADD COLUMN "entities" JSONB;
ALTER TABLE "posts" ADD COLUMN "telegramPayload" JSONB;
ALTER TABLE "posts" ADD COLUMN "telegramMessageSnapshot" JSONB;
ALTER TABLE "posts" ADD COLUMN "contentFormat" TEXT;
ALTER TABLE "posts" ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "post_media" (
  "id" SERIAL PRIMARY KEY,
  "postId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "fileUniqueId" TEXT,
  "mediaGroupId" TEXT,
  "caption" TEXT,
  "captionEntities" JSONB,
  "width" INTEGER,
  "height" INTEGER,
  "duration" INTEGER,
  "fileName" TEXT,
  "mimeType" TEXT,
  "fileSize" INTEGER,
  "thumbnailFileId" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "post_media_postId_idx" ON "post_media"("postId");
CREATE INDEX "post_media_mediaGroupId_idx" ON "post_media"("mediaGroupId");

CREATE TABLE "post_entities" (
  "id" SERIAL PRIMARY KEY,
  "postId" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'text',
  "type" TEXT NOT NULL,
  "offset" INTEGER NOT NULL,
  "length" INTEGER NOT NULL,
  "url" TEXT,
  "user" JSONB,
  "language" TEXT,
  "customEmojiId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_entities_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "post_entities_postId_idx" ON "post_entities"("postId");
CREATE INDEX "post_entities_type_idx" ON "post_entities"("type");

CREATE TABLE "post_attachments" (
  "id" SERIAL PRIMARY KEY,
  "postId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "fileId" TEXT,
  "url" TEXT,
  "name" TEXT,
  "payload" JSONB,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_attachments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "post_attachments_postId_idx" ON "post_attachments"("postId");

CREATE TABLE "post_keyboards" (
  "id" SERIAL PRIMARY KEY,
  "postId" INTEGER NOT NULL,
  "row" INTEGER NOT NULL DEFAULT 0,
  "col" INTEGER NOT NULL DEFAULT 0,
  "text" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "value" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "post_keyboards_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "post_keyboards_postId_idx" ON "post_keyboards"("postId");
