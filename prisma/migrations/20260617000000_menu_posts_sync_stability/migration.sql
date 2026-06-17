-- PostgreSQL stores text and jsonb as UTF-8, so no destructive charset conversion is needed.
-- Document the synchronized menu/post data contract and add comments for future migrations.
COMMENT ON COLUMN "system_settings"."value" IS 'JSONB settings payloads are stored as UTF-8. menu_layout preserves button text/label/title/ref/id/metadata and is validated by the service layer.';
COMMENT ON COLUMN "posts"."title" IS 'UTF-8 post title. Used as the live source of truth for post-backed menu button labels.';
COMMENT ON COLUMN "post_buttons"."text" IS 'UTF-8 Telegram button label; Persian, emoji, and other Unicode text must be preserved.';
