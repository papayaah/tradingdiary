ALTER TABLE "server_watch_state"
ADD COLUMN IF NOT EXISTS "matched_pattern_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
