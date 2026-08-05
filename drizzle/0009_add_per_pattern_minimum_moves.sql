UPDATE "user_watchlists"
SET "pattern_settings" = jsonb_set(
  "pattern_settings",
  '{minMovePercentByPattern}',
  jsonb_build_object(
    'consecutive', "min_move_percent",
    'momentum-burst', "min_move_percent",
    'range-breakout', "min_move_percent",
    'volume-expansion', "min_move_percent",
    'engulfing-reversal', "min_move_percent"
  ),
  true
);--> statement-breakpoint
UPDATE "server_watch"
SET "pattern_settings" = jsonb_set(
  "pattern_settings",
  '{minMovePercentByPattern}',
  jsonb_build_object(
    'consecutive', "min_move_percent",
    'momentum-burst', "min_move_percent",
    'range-breakout', "min_move_percent",
    'volume-expansion', "min_move_percent",
    'engulfing-reversal', "min_move_percent"
  ),
  true
);
