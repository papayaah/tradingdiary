ALTER TABLE "server_watch_alert" ADD COLUMN IF NOT EXISTS "intraday_change" double precision;--> statement-breakpoint
ALTER TABLE "server_watch_alert" ADD COLUMN IF NOT EXISTS "intraday_change_percent" double precision;
