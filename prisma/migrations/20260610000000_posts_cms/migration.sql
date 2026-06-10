-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED', 'HIDDEN');
CREATE TYPE "PostButtonType" AS ENUM ('URL', 'CALLBACK', 'OPEN_MINI_APP', 'OPEN_WEB', 'COPY_TEXT', 'SEND_COMMAND', 'INTERNAL_NAV');

-- CreateTable: posts
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT,
    "caption" TEXT,
    "mediaFileId" TEXT,
    "mediaType" TEXT,
    "albumMediaIds" JSONB,
    "parseMode" TEXT DEFAULT 'Markdown',
    "buttons" JSONB,
    "command" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "unpublishAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" BIGINT,
    "updatedBy" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");
CREATE INDEX "posts_status_idx" ON "posts"("status");
CREATE INDEX "posts_is_published_idx" ON "posts"("isPublished");
CREATE INDEX "posts_slug_idx" ON "posts"("slug");
CREATE INDEX "posts_sort_order_idx" ON "posts"("sortOrder");

-- CreateTable: post_buttons
CREATE TABLE "post_buttons" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "row" INTEGER NOT NULL DEFAULT 0,
    "col" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "type" "PostButtonType" NOT NULL DEFAULT 'URL',
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_buttons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "post_buttons_post_id_idx" ON "post_buttons"("postId");

-- CreateTable: post_commands
CREATE TABLE "post_commands" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "command" TEXT NOT NULL,
    "aliases" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "post_commands_command_key" ON "post_commands"("command");
CREATE INDEX "post_commands_post_id_idx" ON "post_commands"("postId");
CREATE INDEX "post_commands_command_idx" ON "post_commands"("command");

-- CreateTable: post_views
CREATE TABLE "post_views" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "userId" INTEGER,
    "telegramId" BIGINT,
    "action" TEXT NOT NULL DEFAULT 'view',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "post_views_post_id_idx" ON "post_views"("postId");
CREATE INDEX "post_views_user_id_idx" ON "post_views"("userId");
CREATE INDEX "post_views_created_at_idx" ON "post_views"("createdAt");

-- CreateTable: post_click_logs
CREATE TABLE "post_click_logs" (
    "id" SERIAL NOT NULL,
    "postId" INTEGER NOT NULL,
    "userId" INTEGER,
    "telegramId" BIGINT,
    "buttonText" TEXT,
    "buttonType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_click_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "post_click_logs_post_id_idx" ON "post_click_logs"("postId");

-- AddForeignKey
ALTER TABLE "post_buttons" ADD CONSTRAINT "post_buttons_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_commands" ADD CONSTRAINT "post_commands_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_click_logs" ADD CONSTRAINT "post_click_logs_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
