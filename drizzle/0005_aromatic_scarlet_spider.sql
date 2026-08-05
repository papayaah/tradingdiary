ALTER TABLE "server_watch" ADD COLUMN IF NOT EXISTS "required_candle_count" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_watchlists" ADD COLUMN IF NOT EXISTS "min_move_percent" double precision DEFAULT 0.25 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_watchlists" ADD COLUMN IF NOT EXISTS "required_candle_count" integer DEFAULT 3 NOT NULL;
