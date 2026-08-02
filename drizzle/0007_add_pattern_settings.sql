ALTER TABLE "user_watchlists"
ADD COLUMN "pattern_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "server_watch"
ADD COLUMN "pattern_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
