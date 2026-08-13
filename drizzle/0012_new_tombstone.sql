CREATE TABLE "ai_usage_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"user_id" text,
	"period_key" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"credits_reserved" integer DEFAULT 1 NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"provider" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"cost_usd" double precision,
	"error_message" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_subject_period_idx" ON "ai_usage_event" USING btree ("subject_type","subject_id","period_key");--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_action_idx" ON "ai_usage_event" USING btree ("action");--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage_event" USING btree ("user_id");
