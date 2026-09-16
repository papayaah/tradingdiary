CREATE INDEX IF NOT EXISTS "trade_group_account_day_idx"
ON "trade_group" USING btree ("account_id", "trading_day");
