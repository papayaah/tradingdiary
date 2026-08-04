// Scanner runtime configuration, read from the environment. Kept tiny and
// centralized so the worker, scheduler, and entrypoint agree on settings.

export const scannerConfig = {
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

  // Shadow mode: scan and persist state, but do NOT create user-visible alert
  // rows. The default is shadow so a misconfigured deploy cannot notify users.
  shadow: (process.env.SCANNER_SHADOW ?? 'true').toLowerCase() !== 'false',

  // Bounded worker concurrency so slow providers cannot exhaust sockets/memory.
  concurrency: Number(process.env.SCANNER_CONCURRENCY ?? 4),

  // How often the scheduler looks for due watches.
  schedulerTickMs: Number(process.env.SCANNER_TICK_MS ?? 5000),

  // Per-request provider timeout.
  fetchTimeoutMs: Number(process.env.SCANNER_FETCH_TIMEOUT_MS ?? 15000),

  // First-pass rate limit: cap jobs processed per window across the worker,
  // which bounds provider request volume. A per-provider-credential Redis token
  // bucket is the scale-up refinement (see spec) once multiple providers/plans
  // must be throttled independently.
  rateMax: Number(process.env.SCANNER_RATE_MAX ?? 10),
  rateDurationMs: Number(process.env.SCANNER_RATE_DURATION_MS ?? 1000),

  // Stable identifier for this worker instance (heartbeat key).
  workerId: process.env.SCANNER_WORKER_ID || 'scanner-1',

  // Max recent candles persisted per watch state (see spec).
  maxRecentCandles: 60,

  // Shared candle acquisition (Phase 1 of shared-market-data-scanning). The
  // acquisition bucket length bounds reuse: requests in the same bucket share
  // one provider fetch. TTL keeps a snapshot serveable slightly past its bucket
  // (retries, clock skew); it must stay a small multiple of the interval so
  // stale data is never served. Snapshot candle count is capped so a shared
  // snapshot cannot grow Redis unboundedly (providers already return a bounded
  // window; this is defense-in-depth).
  acquisitionBucketMs: Number(process.env.SCANNER_ACQ_BUCKET_MS ?? 60000),
  snapshotTtlMs: Number(process.env.SCANNER_SNAPSHOT_TTL_MS ?? 75000),
  maxSnapshotCandles: Number(process.env.SCANNER_MAX_SNAPSHOT_CANDLES ?? 1500),

  // Phase 2 distributed single-flight (cross-process). The lock TTL must outlive
  // a normal provider fetch (fetchTimeoutMs) plus a small recovery margin, so a
  // slow-but-alive owner is never preempted; if the owner crashes the lock
  // expires and a waiter takes over. Waiters poll for the snapshot with jittered
  // backoff up to lockWaitMs. A short negative-cache TTL prevents a provider
  // failure from fanning out into one upstream retry per affected watch.
  lockTtlMs: Number(process.env.SCANNER_LOCK_TTL_MS ?? 20000),
  lockWaitMs: Number(process.env.SCANNER_LOCK_WAIT_MS ?? 16000),
  lockPollMs: Number(process.env.SCANNER_LOCK_POLL_MS ?? 150),
  negativeCacheTtlMs: Number(process.env.SCANNER_NEG_CACHE_TTL_MS ?? 10000),

  // Phase 4 base-interval aggregation. When enabled, higher intervals are
  // derived from a single shared 1m fetch (only for providers the capability
  // registry marks aggregatableFrom1m). Defaults OFF: until a deploy sets
  // SCANNER_AGGREGATION=true the scanner fetches each interval natively, exactly
  // as before, so derived candles never change evaluation without an explicit
  // opt-in and parity check.
  aggregationEnabled: (process.env.SCANNER_AGGREGATION ?? 'false').toLowerCase() === 'true',

  // Phase 6 adaptive cadence governor. Enabled by default: the effective
  // per-scope cadence is derived from hourly requests, daily requests, and an
  // estimated monthly payload budget. Caps are runtime config so a plan upgrade
  // is a config change, not a redeploy. Per-scope overrides:
  // SCANNER_PROVIDER_BUDGETS='{"tiingo:server":{"hourlyCap":10000,"dailyCap":100000}}'.
  governorEnabled: (process.env.SCANNER_GOVERNOR ?? 'true').toLowerCase() === 'true',
  governorRecomputeMs: Number(process.env.SCANNER_GOVERNOR_RECOMPUTE_MS ?? 30000),
  governorHysteresisRatio: Number(process.env.SCANNER_GOVERNOR_HYSTERESIS ?? 0.2),
  budgetHourlyCap: Number(process.env.SCANNER_BUDGET_HOURLY ?? 10000),
  budgetDailyCap: Number(process.env.SCANNER_BUDGET_DAILY ?? 100000),
  budgetMonthlyBandwidthBytes: Number(
    process.env.SCANNER_BUDGET_MONTHLY_BYTES ?? 40_000_000_000,
  ),
  estimatedResponseBytesPerBar: Number(
    process.env.SCANNER_ESTIMATED_BYTES_PER_BAR ?? 110,
  ),
  budgetHeadroom: Number(process.env.SCANNER_BUDGET_HEADROOM ?? 0.8),
  budgetFloorSeconds: Number(process.env.SCANNER_BUDGET_FLOOR_SECONDS ?? 15),

  // Phase 7 physical-request quota gate. `quotaEnabled` counts every real
  // upstream fetch in Redis (hourly + daily, per provider scope) — a fast atomic
  // backstop distinct from the durable Postgres audit in provider_request_stats.
  // `quotaEnforce` decides what happens at the cap: OFF (default) observes and
  // logs what it WOULD block so we can watch real headroom first; ON refuses the
  // fetch (bounded degradation to cache/no-data) so a plan limit is never
  // crossed. The governor's cadence keeps us under the cap in normal operation;
  // this gate is the hard ceiling when cadence estimation is wrong.
  quotaEnabled: (process.env.SCANNER_QUOTA ?? 'true').toLowerCase() === 'true',
  quotaEnforce: (process.env.SCANNER_QUOTA_ENFORCE ?? 'false').toLowerCase() === 'true',
} as const;

export const SCAN_QUEUE = 'market-scan';
