ALTER TABLE "user_watchlists"
ADD COLUMN IF NOT EXISTS "pattern_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "server_watch"
ADD COLUMN IF NOT EXISTS "pattern_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
