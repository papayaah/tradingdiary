ALTER TABLE "user_watchlists" ADD COLUMN IF NOT EXISTS "pattern_ids" jsonb DEFAULT '["consecutive"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "server_watch" ADD COLUMN IF NOT EXISTS "pattern_ids" jsonb DEFAULT '["consecutive"]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "user_watchlists" SET "pattern_ids" = jsonb_build_array("pattern_id");--> statement-breakpoint
UPDATE "server_watch" SET "pattern_ids" = jsonb_build_array("pattern_id");
