CREATE TABLE "scanner_heartbeat" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_beat_at" timestamp DEFAULT now() NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "server_watch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"asset_class" text NOT NULL,
	"interval" text NOT NULL,
	"min_move_percent" double precision NOT NULL,
	"session" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"provider_credential_id" uuid,
	"scan_frequency_seconds" integer NOT NULL,
	"next_scan_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_watch_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"watch_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"interval" text NOT NULL,
	"direction" text NOT NULL,
	"candle_time" timestamp NOT NULL,
	"price" double precision NOT NULL,
	"change_percent" double precision NOT NULL,
	"message" text NOT NULL,
	"pattern_version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_watch_state" (
	"watch_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"last_price" double precision,
	"last_candle_time" timestamp,
	"last_scanned_at" timestamp,
	"last_provider" text,
	"last_error" text,
	"recent_candles" jsonb DEFAULT '[]' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- IF NOT EXISTS: this table predates the migration history (it was created via
-- `drizzle-kit push` and is missing from 0000_init), so it may already exist.
CREATE TABLE IF NOT EXISTS "user_watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"watchlist" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "watch_event" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_watch" ADD CONSTRAINT "server_watch_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_watch_alert" ADD CONSTRAINT "server_watch_alert_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_watch_alert" ADD CONSTRAINT "server_watch_alert_watch_id_server_watch_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."server_watch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_watch_state" ADD CONSTRAINT "server_watch_state_watch_id_server_watch_id_fk" FOREIGN KEY ("watch_id") REFERENCES "public"."server_watch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_watchlists" ADD CONSTRAINT "user_watchlists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
ALTER TABLE "watch_event" ADD CONSTRAINT "watch_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "server_watch_identity_uq" ON "server_watch" USING btree ("user_id","symbol","interval");--> statement-breakpoint
CREATE INDEX "server_watch_due_idx" ON "server_watch" USING btree ("enabled","next_scan_at");--> statement-breakpoint
CREATE INDEX "server_watch_user_idx" ON "server_watch" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "server_watch_alert_dedup_uq" ON "server_watch_alert" USING btree ("watch_id","candle_time","direction","pattern_version");--> statement-breakpoint
CREATE INDEX "server_watch_alert_user_idx" ON "server_watch_alert" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "watch_event_id_uq" ON "watch_event" USING btree ("id");--> statement-breakpoint
CREATE INDEX "watch_event_user_seq_idx" ON "watch_event" USING btree ("user_id","seq");