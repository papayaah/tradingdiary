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
} as const;

export const SCAN_QUEUE = 'market-scan';
