-- Non-destructive crop settings for news covers and event banners.
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "cover_crop" jsonb;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "banner_crop" jsonb;
