import {
    pgTable,
    text,
    timestamp,
    boolean,
    uuid,
    jsonb,
    integer,
    doublePrecision,
    bigserial,
    date,
    index,
    uniqueIndex,
    primaryKey,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Better Auth Tables (Postgres)
// ============================================================================

export const user = pgTable('user', {
    id: text('id').primaryKey(),
    name: text('name'),
    email: text('email'),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export const account = pgTable('account', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    accountId: text('account_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { mode: 'date' }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { mode: 'date' }),
    scope: text('scope'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export const session = pgTable('session', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    token: text('token'),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).notNull().defaultNow(),
});

// ============================================================================
// App-Specific Schema (Trading Diary)
// ============================================================================

export const projects = pgTable("projects", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    name: text("name").notNull(),
    data: jsonb("data").notNull(), // Stores project-specific JSON
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const userWatchlists = pgTable("user_watchlists", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    watchlist: jsonb("watchlist").notNull(),
    patternId: text("pattern_id").notNull().default('consecutive'),
    patternIds: jsonb("pattern_ids").notNull().default(['consecutive']),
    minMovePercent: doublePrecision("min_move_percent").notNull().default(0.25),
    requiredCandleCount: integer("required_candle_count").notNull().default(3),
    maxBodyOverlapPercent: doublePrecision("max_body_overlap_percent").notNull().default(100),
    patternSettings: jsonb("pattern_settings").notNull().default({}),
    session: text("session").notNull().default('pre'),
    scanFrequencySeconds: integer("scan_frequency_seconds").notNull().default(15),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

// ============================================================================
// Server-Side Market Scanner
// See docs/specs/server-side-market-scanner.md ("Server-owned data model").
// Normalized watches for scheduling/querying at scale, their latest state,
// deduplicated alerts, a scanner heartbeat, and a durable per-user event log.
// ============================================================================

// One normalized watch. PostgreSQL is the source of scheduling truth:
// scanFrequencySeconds + nextScanAt + session + enabled define the cadence.
export const serverWatch = pgTable("server_watch", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    symbol: text("symbol").notNull(),
    assetClass: text("asset_class").notNull(), // 'equity' | 'futures' | 'crypto'
    interval: text("interval").notNull(),
    patternId: text("pattern_id").notNull().default('consecutive'),
    patternIds: jsonb("pattern_ids").notNull().default(['consecutive']),
    minMovePercent: doublePrecision("min_move_percent").notNull(),
    requiredCandleCount: integer("required_candle_count").notNull().default(3),
    maxBodyOverlapPercent: doublePrecision("max_body_overlap_percent").notNull().default(100),
    patternSettings: jsonb("pattern_settings").notNull().default({}),
    session: text("session").notNull(), // 'rth' | 'pre' | 'ext' | 'all'
    enabled: boolean("enabled").notNull().default(true),
    providerCredentialId: uuid("provider_credential_id"), // FK added when a credentials table exists
    scanFrequencySeconds: integer("scan_frequency_seconds").notNull(),
    nextScanAt: timestamp("next_scan_at", { mode: 'string' }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    // User-visible identity of a watch (one watch per symbol+interval per user).
    uniqueIndex("server_watch_identity_uq").on(t.userId, t.symbol, t.interval),
    // Due-selection scan: enabled watches ordered by next scan time.
    index("server_watch_due_idx").on(t.enabled, t.nextScanAt),
    index("server_watch_user_idx").on(t.userId),
]);

// Latest state per watch (one-to-one). Holds a bounded recent-candle window.
export const serverWatchState = pgTable("server_watch_state", {
    watchId: uuid("watch_id").primaryKey().references(() => serverWatch.id, { onDelete: 'cascade' }),
    status: text("status").notNull(), // idle | normal | bullish | bearish | no-data | error
    lastPrice: doublePrecision("last_price"),
    lastCandleTime: timestamp("last_candle_time", { mode: 'string' }),
    lastScannedAt: timestamp("last_scanned_at", { mode: 'string' }),
    lastProvider: text("last_provider"),
    lastError: text("last_error"),
    // At most 60 ascending, session-filtered CandleSnapshot rows (see spec).
    recentCandles: jsonb("recent_candles").notNull().default('[]'),
    // Session change vs the prior close/settlement (equity: prior RTH close;
    // futures: prior daily settlement). Surfaced on the watchlist row.
    intradayChange: doublePrecision("intraday_change"),
    intradayChangePercent: doublePrecision("intraday_change_percent"),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
});

// Deduplicated alerts. The unique index is the authoritative dedup guarantee.
export const serverWatchAlert = pgTable("server_watch_alert", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    watchId: uuid("watch_id").notNull().references(() => serverWatch.id, { onDelete: 'cascade' }),
    symbol: text("symbol").notNull(),
    interval: text("interval").notNull(),
    direction: text("direction").notNull(), // 'bullish' | 'bearish'
    candleTime: timestamp("candle_time", { mode: 'string' }).notNull(),
    price: doublePrecision("price").notNull(),
    changePercent: doublePrecision("change_percent").notNull(),
    intradayChange: doublePrecision("intraday_change"),
    intradayChangePercent: doublePrecision("intraday_change_percent"),
    message: text("message").notNull(),
    patternId: text("pattern_id").notNull().default('consecutive'),
    patternVersion: integer("pattern_version").notNull(),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    // At most one alert per candle, direction, detector, and detector version.
    uniqueIndex("server_watch_alert_dedup_uq").on(
      t.watchId,
      t.candleTime,
      t.direction,
      t.patternId,
      t.patternVersion,
    ),
    // Recent-alerts queries per user.
    index("server_watch_alert_user_idx").on(t.userId, t.createdAt),
]);

// Scanner liveness. A stale lastBeatAt drives the visible degraded/offline UI.
export const scannerHeartbeat = pgTable("scanner_heartbeat", {
    workerId: text("worker_id").primaryKey(),
    status: text("status").notNull().default('ok'),
    lastBeatAt: timestamp("last_beat_at", { mode: 'string' }).notNull().defaultNow(),
    detail: jsonb("detail"),
});

// Durable, per-user event log. `seq` is the monotonic cursor clients catch up
// from; `id` is the stable identifier carried in the transactional NOTIFY.
export const watchEvent = pgTable("watch_event", {
    seq: bigserial("seq", { mode: 'number' }).primaryKey(),
    id: uuid("id").notNull().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    type: text("type").notNull(), // watch.updated | watch.removed | watch.state | alert.created | scanner.status
    payload: jsonb("payload").notNull(), // record identifiers/cursors only — never secrets or large candle sets
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex("watch_event_id_uq").on(t.id),
    // Per-user catch-up: events after a given cursor.
    index("watch_event_user_seq_idx").on(t.userId, t.seq),
]);

// Web Push device subscriptions for closed-browser mobile & desktop push notifications.
export const userPushSubscription = pgTable("user_push_subscription", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text("endpoint").notNull().unique(),
    keys: jsonb("keys").notNull(), // { p256dh: string, auth: string }
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    index("user_push_sub_user_idx").on(t.userId),
]);

// Server-side market-data provider request counts (admin analytics). Kept in
// sync with lib/metrics/provider-usage.ts, which also self-creates this table
// (CREATE TABLE IF NOT EXISTS) on first write for environments without an
// auto-migrate step. Defined here so drizzle-kit treats it as a managed table
// and never proposes dropping it.
export const providerRequestStats = pgTable("provider_request_stats", {
    day: date("day").notNull(),
    provider: text("provider").notNull(),
    keyOwner: text("key_owner").notNull(),
    count: integer("count").notNull().default(0),
}, (t) => [
    primaryKey({ columns: [t.day, t.provider, t.keyOwner] }),
]);
