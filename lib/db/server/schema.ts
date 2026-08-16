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
    // Detectors that matched the latest candle. Empty means the selected
    // detectors were checked and none matched.
    matchedPatternIds: jsonb("matched_pattern_ids").notNull().default('[]'),
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

// Permanent database table for invalid / non-existent ticker symbols (404s).
export const invalidSymbols = pgTable("invalid_symbols", {
    symbol: text("symbol").primaryKey(), // Uppercase canonical symbol (e.g. 'ASDFGHJK')
    reason: text("reason").notNull(),     // e.g. '404 Not Found from Tiingo'
    provider: text("provider"),          // e.g. 'Tiingo' or 'all'
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
});

// Authoritative hosted-AI credit ledger. Product allowances are evaluated by
// the app, while the reusable ai-connect meter owns the reserve/settle shape.
export const aiUsageEvent = pgTable("ai_usage_event", {
    id: uuid("id").primaryKey(),
    subjectType: text("subject_type").notNull(), // guest | user
    subjectId: text("subject_id").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: 'set null' }),
    periodKey: text("period_key").notNull(),
    action: text("action").notNull(),
    status: text("status").notNull(), // reserved | succeeded | failed
    creditsReserved: integer("credits_reserved").notNull().default(1),
    creditsCharged: integer("credits_charged").notNull().default(0),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    costUsd: doublePrecision("cost_usd"),
    errorMessage: text("error_message"),
    expiresAt: timestamp("expires_at", { mode: 'date' }).notNull(),
    createdAt: timestamp("created_at", { mode: 'date' }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { mode: 'date' }),
}, (t) => [
    index("ai_usage_subject_period_idx").on(t.subjectType, t.subjectId, t.periodKey),
    index("ai_usage_created_idx").on(t.createdAt),
    index("ai_usage_action_idx").on(t.action),
    index("ai_usage_user_idx").on(t.userId),
]);

// ============================================================================
// React Engage Suite Tables (Postgres)
// ============================================================================

export const engageTickets = pgTable("engage_tickets", {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull().default("app"),
    type: text("type").notNull().default("ticket"), // 'bug' | 'suggestion' | 'ticket' | 'newsletter'
    category: text("category").default("GENERAL"),
    severity: text("severity"),                    // 'low' | 'medium' | 'high' | 'critical'
    status: text("status").notNull().default("open"), // 'open' | 'in_progress' | 'resolved' | 'closed'
    subject: text("subject"),
    message: text("message").notNull(),
    userEmail: text("user_email"),
    userName: text("user_name"),
    attachments: jsonb("attachments"),             // Attached screenshots or logs
    environment: jsonb("environment"),             // URL, browser, OS, screen specs
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
});

export const engageSubscribers = pgTable("engage_subscribers", {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull().default("app"),
    email: text("email").notNull().unique(),
    name: text("name"),
    frequency: text("frequency").default("all"),    // 'all' | 'weekly' | 'monthly'
    subscribedAt: timestamp("subscribed_at", { mode: 'string' }).notNull().defaultNow(),
});

export const engageTemplates = pgTable("engage_templates", {
    id: text("id").primaryKey(),                    // 'welcome' | 'ticket_reply' | 'newsletter'
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    htmlContent: text("html_content").notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
});

export const engageBroadcasts = pgTable("engage_broadcasts", {
    id: text("id").primaryKey(),
    appId: text("app_id").notNull().default("app"),
    subject: text("subject").notNull(),
    content: text("content").notNull(),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentAt: timestamp("sent_at", { mode: 'string' }).notNull().defaultNow(),
});

// ============================================================================
// Journal Persistence & Sync (Postgres)
// See docs/specs/journal-persistence-and-sync.md and
// docs/specs/flat-to-flat-trade-identity.md.
//
// Server-authoritative journal for authenticated users. Guests stay local
// (IndexedDB); on sign-in their data is adopted here and every device on the
// login syncs from these tables. Every user-owned row carries:
//   - a stable UUID `id` (never a date/symbol/account composite),
//   - `rev` (bumped on every write) as the basis for conflict detection,
//   - `deletedAt` tombstone so deletions propagate,
//   - createdAt/updatedAt.
// ============================================================================

// A trading account. `clientAccountId` is the id the local (IndexedDB) app
// generated; it is the dedup/adoption key so re-adoption never duplicates.
export const tradingAccount = pgTable("trading_account", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    clientAccountId: text("client_account_id").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    currency: text("currency").notNull(),
    address: text("address").notNull().default(''),
    initialBalance: doublePrecision("initial_balance"),
    importedAt: timestamp("imported_at", { mode: 'string' }),
    rev: integer("rev").notNull().default(1),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex("trading_account_client_uq").on(t.userId, t.clientAccountId),
    index("trading_account_user_idx").on(t.userId),
]);

// One raw execution (fill). Immutable source record. `idempotencyKey` is the
// content hash used to block duplicate imports and make adoption idempotent.
export const execution = pgTable("execution", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    accountId: uuid("account_id").notNull().references(() => tradingAccount.id, { onDelete: 'cascade' }),
    idempotencyKey: text("idempotency_key").notNull(),
    sourceTradeId: text("source_trade_id").notNull(),
    symbol: text("symbol").notNull(),
    companyName: text("company_name").notNull().default(''),
    exchanges: text("exchanges").notNull().default(''),
    side: text("side").notNull(), // BUYTOOPEN | SELLTOOPEN | BUYTOCLOSE | SELLTOCLOSE
    orderType: text("order_type").notNull().default(''),
    date: text("date").notNull(), // YYYYMMDD (raw execution date)
    time: text("time").notNull(), // HH:MM:SS
    currency: text("currency").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    multiplier: doublePrecision("multiplier").notNull().default(1),
    price: doublePrecision("price").notNull(),
    totalValue: doublePrecision("total_value").notNull(),
    commission: doublePrecision("commission").notNull().default(0),
    feeMultiplier: doublePrecision("fee_multiplier").notNull().default(1),
    realizedPnL: doublePrecision("realized_pnl"),
    unrealizedPnL: doublePrecision("unrealized_pnl"),
    fxRateToAccount: doublePrecision("fx_rate_to_account"),
    fxAccountCurrency: text("fx_account_currency"),
    fxRateDate: text("fx_rate_date"),
    fxRateProvider: text("fx_rate_provider"),
    rev: integer("rev").notNull().default(1),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex("execution_idempotency_uq").on(t.userId, t.idempotencyKey),
    index("execution_account_idx").on(t.accountId),
    index("execution_user_symbol_idx").on(t.userId, t.symbol),
]);

// One flat-to-flat round trip (the reviewable trade). Derived from executions by
// the splitter, persisted so notes/tags/reviews have a stable FK target.
// `clientKey` is the splitter's deterministic key for idempotent re-splitting.
export const tradeGroup = pgTable("trade_group", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    accountId: uuid("account_id").notNull().references(() => tradingAccount.id, { onDelete: 'cascade' }),
    clientKey: text("client_key").notNull(),
    symbol: text("symbol").notNull(),
    companyName: text("company_name").notNull().default(''),
    currency: text("currency").notNull(),
    accountCurrency: text("account_currency").notNull(),
    side: text("side").notNull(), // LONG | SHORT
    openedDate: text("opened_date").notNull(), // YYYYMMDD
    openedTime: text("opened_time").notNull(), // HH:MM:SS
    closedDate: text("closed_date"),
    closedTime: text("closed_time"),
    tradingDay: text("trading_day").notNull(), // cutoff-adjusted opening day
    entryAvgPrice: doublePrecision("entry_avg_price").notNull().default(0),
    exitAvgPrice: doublePrecision("exit_avg_price").notNull().default(0),
    maxPosition: doublePrecision("max_position").notNull().default(0),
    volume: doublePrecision("volume").notNull().default(0),
    grossPnL: doublePrecision("gross_pnl").notNull().default(0),
    totalCommissions: doublePrecision("total_commissions").notNull().default(0),
    netPnL: doublePrecision("net_pnl").notNull().default(0),
    nativeGrossPnL: doublePrecision("native_gross_pnl").notNull().default(0),
    nativeTotalCommissions: doublePrecision("native_total_commissions").notNull().default(0),
    nativeNetPnL: doublePrecision("native_net_pnl").notNull().default(0),
    isOpen: boolean("is_open").notNull().default(false),
    netQuantity: doublePrecision("net_quantity").notNull().default(0),
    openAvgCost: doublePrecision("open_avg_cost").notNull().default(0),
    fxRateToAccount: doublePrecision("fx_rate_to_account"),
    fxRateDate: text("fx_rate_date"),
    rev: integer("rev").notNull().default(1),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex("trade_group_client_uq").on(t.userId, t.clientKey),
    index("trade_group_account_idx").on(t.accountId),
    index("trade_group_user_day_idx").on(t.userId, t.tradingDay),
    index("trade_group_user_symbol_idx").on(t.userId, t.symbol),
]);

// Execution ↔ trade-group membership. Many-to-many because a reversal fill
// belongs to the trade it closes and the trade it opens; `sliceQuantity` is the
// portion of the fill attributed to this group and `role` which side.
export const tradeGroupExecution = pgTable("trade_group_execution", {
    tradeGroupId: uuid("trade_group_id").notNull().references(() => tradeGroup.id, { onDelete: 'cascade' }),
    executionId: uuid("execution_id").notNull().references(() => execution.id, { onDelete: 'cascade' }),
    role: text("role").notNull(), // open | close
    sliceQuantity: doublePrecision("slice_quantity").notNull(),
}, (t) => [
    primaryKey({ columns: [t.tradeGroupId, t.executionId, t.role] }),
    index("trade_group_execution_exec_idx").on(t.executionId),
]);

// A note on a journal day (per account). Keyed by account + tradingDay.
export const dailyNote = pgTable("daily_note", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    accountId: uuid("account_id").notNull().references(() => tradingAccount.id, { onDelete: 'cascade' }),
    tradingDay: text("trading_day").notNull(), // YYYYMMDD
    content: text("content").notNull().default(''),
    rev: integer("rev").notNull().default(1),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex("daily_note_identity_uq").on(t.userId, t.accountId, t.tradingDay),
    index("daily_note_user_idx").on(t.userId),
]);

// A note on one trade (per trade_group). Per the resolved decision, notes attach
// per trade, not per day+symbol.
export const tradeNote = pgTable("trade_note", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    tradeGroupId: uuid("trade_group_id").notNull().references(() => tradeGroup.id, { onDelete: 'cascade' }),
    content: text("content").notNull().default(''),
    rev: integer("rev").notNull().default(1),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex("trade_note_identity_uq").on(t.userId, t.tradeGroupId),
]);

// A reusable, categorized tag.
export const tag = pgTable("tag", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    label: text("label").notNull(),
    category: text("category").notNull().default('general'), // setup | mistake | emotion | ...
    color: text("color"),
    archivedAt: timestamp("archived_at", { mode: 'string' }),
    rev: integer("rev").notNull().default(1),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex("tag_identity_uq").on(t.userId, t.category, t.label),
    index("tag_user_idx").on(t.userId),
]);

// Trade ↔ tag join.
export const tradeTag = pgTable("trade_tag", {
    tradeGroupId: uuid("trade_group_id").notNull().references(() => tradeGroup.id, { onDelete: 'cascade' }),
    tagId: uuid("tag_id").notNull().references(() => tag.id, { onDelete: 'cascade' }),
}, (t) => [
    primaryKey({ columns: [t.tradeGroupId, t.tagId] }),
    index("trade_tag_tag_idx").on(t.tagId),
]);

// A persisted AI trade review, tied to a real trade_group.
export const tradeAiReview = pgTable("trade_ai_review", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    tradeGroupId: uuid("trade_group_id").notNull().references(() => tradeGroup.id, { onDelete: 'cascade' }),
    summary: text("summary").notNull(),
    observations: jsonb("observations").notNull().default('[]'),
    executionReview: text("execution_review"),
    riskReview: text("risk_review"),
    questionsForTrader: jsonb("questions_for_trader"),
    takeaway: text("takeaway"),
    evidenceConfidence: text("evidence_confidence").notNull().default('low'),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    contextHash: text("context_hash").notNull(),
    rev: integer("rev").notNull().default(1),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    index("trade_ai_review_group_idx").on(t.tradeGroupId),
    index("trade_ai_review_user_idx").on(t.userId),
]);

// Attachment (screenshot/media) metadata. Binary blobs live in object storage
// under `storageKey`; Postgres holds metadata only. `linkType`/`linkId`
// associate it with a trade_group or a journal day.
export const attachment = pgTable("attachment", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    storageKey: text("storage_key"),
    mime: text("mime"),
    bytes: integer("bytes"),
    linkType: text("link_type"), // trade | day
    linkId: text("link_id"),
    rev: integer("rev").notNull().default(1),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    index("attachment_user_idx").on(t.userId),
    index("attachment_link_idx").on(t.linkType, t.linkId),
]);

// Per-user monotonic change log for sync catch-up (mirrors watch_event). Clients
// pull events after their last `seq`. Payload carries record id + rev only.
export const journalEvent = pgTable("journal_event", {
    seq: bigserial("seq", { mode: 'number' }).primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: 'cascade' }),
    entity: text("entity").notNull(), // account | execution | trade_group | daily_note | trade_note | tag | review | attachment
    entityId: uuid("entity_id").notNull(),
    op: text("op").notNull(), // upsert | delete
    rev: integer("rev").notNull(),
    createdAt: timestamp("created_at", { mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    index("journal_event_user_seq_idx").on(t.userId, t.seq),
]);

