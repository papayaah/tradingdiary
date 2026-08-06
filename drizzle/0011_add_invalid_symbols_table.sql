CREATE TABLE "invalid_symbols" (
	"symbol" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"provider" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_watch" ADD COLUMN "pattern_ids" jsonb DEFAULT '["consecutive"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "server_watch" ADD COLUMN "pattern_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "server_watch_state" ADD COLUMN "matched_pattern_ids" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "server_watch_state" ADD COLUMN "intraday_change" double precision;--> statement-breakpoint
ALTER TABLE "server_watch_state" ADD COLUMN "intraday_change_percent" double precision;--> statement-breakpoint
ALTER TABLE "user_watchlists" ADD COLUMN "pattern_ids" jsonb DEFAULT '["consecutive"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_watchlists" ADD COLUMN "pattern_settings" jsonb DEFAULT '{}'::jsonb NOT NULL;