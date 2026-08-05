CREATE TABLE IF NOT EXISTS "provider_request_stats" (
	"day" date NOT NULL,
	"provider" text NOT NULL,
	"key_owner" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "provider_request_stats_day_provider_key_owner_pk" PRIMARY KEY("day","provider","key_owner")
);
--> statement-breakpoint
ALTER TABLE "server_watch" ADD COLUMN IF NOT EXISTS "max_body_overlap_percent" double precision DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_watchlists" ADD COLUMN IF NOT EXISTS "max_body_overlap_percent" double precision DEFAULT 100 NOT NULL;
