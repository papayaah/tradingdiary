CREATE TABLE IF NOT EXISTS "user_push_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_push_subscription_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
DROP INDEX "server_watch_alert_dedup_uq";--> statement-breakpoint
ALTER TABLE "server_watch" ADD COLUMN "pattern_id" text DEFAULT 'consecutive' NOT NULL;--> statement-breakpoint
ALTER TABLE "server_watch_alert" ADD COLUMN "pattern_id" text DEFAULT 'consecutive' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_watchlists" ADD COLUMN "pattern_id" text DEFAULT 'consecutive' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_watchlists" ADD COLUMN "session" text DEFAULT 'pre' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_watchlists" ADD COLUMN "scan_frequency_seconds" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_push_subscription" ADD CONSTRAINT "user_push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_push_sub_user_idx" ON "user_push_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "server_watch_alert_dedup_uq" ON "server_watch_alert" USING btree ("watch_id","candle_time","direction","pattern_id","pattern_version");
