# Shared Market-Data Scanning Across Users

## Status

**Partially implemented (server-side).** Phases 1–4 and 6 are built and tested on
`main`; Phase 5 is intentionally skipped. The scale features (Phase 4 aggregation,
Phase 6 governor) are complete but gated OFF by default behind flags. Both hard
prerequisites remain outstanding. See "Implementation status" below.

### Implementation status

| Item | State | Notes |
|---|---|---|
| Phase 1 — exact-request shared cache | ✅ live | `lib/scanner/shared/`; worker fetch routed through `SharedCandleService` |
| Phase 2 — distributed single-flight + negative cache | ✅ live | token-owned Redis locks, jittered waiters, per-key negative cache |
| Phase 3 — provider capability registry + symbol normalization | ✅ live | provider-aware canonical symbols; capability registry |
| Phase 4 — base-interval aggregation | ⚙️ built, OFF | enable with `SCANNER_AGGREGATION=true` |
| Phase 5 — scheduler grouping | ⏭️ skipped | "only if needed"; no measured queue pressure |
| Phase 6 — adaptive cadence governor | ⚙️ built, OFF | enable with `SCANNER_GOVERNOR=true`; caps via `SCANNER_PROVIDER_BUDGETS` |
| Prerequisite 1 — server-authoritative provider config | ❌ not done | scanner still uses server env keys; per-user credentials never reach it |
| Prerequisite 2 — browser is a pure viewer (no fetching) | ❌ not done | open tabs still fetch market data independently — an uncounted second consumer |
| Provider-scoped distributed rate limiter | ❌ not done | still the single global BullMQ worker limiter |
| Observability counters (hit rate, sharing ratio) | ❌ not done | snapshots written; metrics not yet emitted |

Because the two prerequisites are outstanding, the "fetch scales with unique
symbols, never users" invariant currently holds only for the **server scanner**,
not for authenticated browsers (each open tab still fetches independently), and
all sharing happens under a single server-credential scope rather than per-user
entitlement scopes.

## Related specification

This document extends [Server-Side Market Scanner and Live Watch Clients](./server-side-market-scanner.md). The existing scanner remains responsible for user watches, pattern evaluation, alert persistence, SSE events, and Web Push. This specification changes how scanner jobs acquire candles so equivalent watches do not repeatedly call a market-data provider.

## Summary

The current scanner schedules and processes one job per user watch. A watch is uniquely identified by `(userId, symbol, interval)`, and each job fetches candles before evaluating that user's detector. Consequently, five users watching `AAPL` at `10m` can generate approximately five equivalent provider requests per scan window.

Market candles are not user-specific. The scanner should acquire an eligible candle snapshot once and reuse it across all watches that can legally and technically share that data. Pattern selection, thresholds, schedules, watch state, alerts, events, and notifications remain isolated per user.

The implementation should proceed in two stages:

1. **Exact-request sharing:** deduplicate concurrent and recently completed fetches with the same provider entitlement, canonical symbol, requested interval, fetch scope, and time bucket.
2. **Base-interval aggregation:** where provider semantics permit, fetch a small canonical interval such as `1m` once and derive `5m`, `10m`, `15m`, and other supported intervals.

Exact-request sharing delivers most of the immediate protection against duplicated API calls with substantially less risk. Aggregation is an additional optimization, not a prerequisite.

## Prerequisites (found during single-user rollout)

Shared acquisition only reduces provider load if the scanner is the *sole* market-data consumer and already owns provider identity. Two gaps observed running the single-user scanner in production must be closed first, or sharing will not actually bound provider usage:

1. **Server-authoritative provider configuration is required.** Sharing partitions by `providerScope` (a credential/entitlement identity), so provider *selection* and *credentials* must live server-side. Today they live in **browser cookies** and never reach the scanner — the server falls back to a server-wide env key regardless of the user's UI choice. You cannot construct a correct `providerScope`, nor honor per-user entitlement/licensing, while the credential is only in the browser. This is a **hard prerequisite** for per-user-credential sharing. See [Scanner Configuration: Server as the Source of Truth](./scanner-config-server-authority.md).

2. **The browser must not fetch market data when a server scan is authoritative.** The legacy client still runs its own per-symbol round-robin fetch loop *in parallel* with the server scanner, using the browser's own cookie credential. That is an **uncounted second consumer**: it duplicates provider calls per signed-in tab, and it is invisible to the server-side acquisition cache and rate limiter. Every open tab re-adds linear provider load that shared acquisition can neither see nor bound. So "the authenticated browser is a pure viewer (snapshot + SSE only, no fetching)" is part of this spec's baseline, not an optimization. (Main scanner spec: "Remove from the browser: per-symbol automatic market-data fetches.")

## Goals

- Prevent provider usage from scaling linearly with the number of users watching the same market data.
- Preserve independent per-user patterns, thresholds, sessions, scan frequencies, alerts, and notification preferences.
- Support users watching the same symbol at different intervals.
- Preserve current intrabar alert behavior unless a detector explicitly requires completed candles.
- Respect provider credentials, subscriptions, exchange entitlements, and redistribution restrictions.
- Avoid duplicate upstream requests when workers process equivalent jobs concurrently.
- Continue to recover safely after Redis loss, worker restarts, provider failures, and job retries.
- Provide metrics that show cache efficiency and actual upstream request volume.
- Allow incremental rollout without replacing the existing `server_watch` and alert data models.

## Non-goals

- Sharing private watchlists, thresholds, patterns, alerts, or notification settings between users.
- Redistributing one user's paid market-data entitlement to other users without explicit authorization and provider permission.
- Building an exchange-direct tick plant.
- Storing an unlimited historical market-data archive.
- Guaranteeing that every provider can be normalized to one universal base interval.
- Changing the meaning of the existing pattern detectors as part of this optimization.

## Current behavior

The current unit of scheduling and queue deduplication is a user-owned watch:

```text
server_watch row
    └── BullMQ job: watchId + scheduledFor
            └── provider.fetchRecentCandles(symbol, interval)
                    └── evaluate one user's pattern and threshold
```

BullMQ collapses duplicate delivery of the same watch job, but different users have different watch IDs. It therefore does not collapse equivalent market-data requests across users.

The provider limiter caps request throughput, but limiting does not reduce the number of provider calls. Duplicate jobs are delayed rather than shared.

## Proposed architecture

Separate market-data acquisition from user-watch evaluation:

```text
Due user watches
      │
      ├── group/share eligibility
      ▼
┌───────────────────────────────┐
│ Market-data acquisition      │
│ - canonical request key      │
│ - Redis snapshot cache       │
│ - distributed single-flight  │
│ - provider rate limit        │
└──────────────┬────────────────┘
               │ one reusable candle snapshot
        ┌──────┴───────────────┐
        ▼                      ▼
 User A evaluation        User B evaluation
 consecutive / 0.25%     momentum / 0.50%
        │                      │
        ▼                      ▼
 isolated state, alerts, events, and notifications
```

The system shares only the immutable market-data snapshot. Evaluation remains a per-watch operation because users may have different:

- pattern IDs;
- minimum movement thresholds;
- enabled states;
- scan frequencies;
- session preferences;
- alert history and deduplication state;
- notification subscriptions.

Pattern evaluation is local CPU work and is expected to be much cheaper than an upstream provider request.

## Canonical market-data request

Every acquisition must be described by a canonical request:

```ts
interface MarketDataRequest {
  providerScope: string;
  canonicalSymbol: string;
  interval: string;
  fetchScope: string;
  timeBucket: number;
}
```

### Provider scope

`providerScope` identifies data that may safely be reused together. It must include enough information to prevent accidental entitlement crossover.

Examples:

- `yahoo:public`
- `polygon:server-account`
- `databento:server-account`
- `polygon:user-credential:<credentialId>`

Two requests may share data only when their provider scopes are compatible under the application's credential policy and the provider's terms. A per-user credential is private by default. Data fetched using it must not be served to another user unless an explicit entitlement and licensing policy permits that sharing.

Raw API keys, tokens, or secrets must never appear in Redis keys, logs, jobs, metrics, or events.

### Canonical symbol

Equivalent provider-specific symbols must normalize before creating a cache key.

Examples:

- `MNQ`, `/MNQ`, and `MNQU6` may map to Yahoo's continuous `MNQ=F` request when Yahoo is the selected provider.
- Equity symbols normalize case and provider-required exchange suffixes.
- Crypto pairs normalize separators such as `BTCUSD` and `BTC-USD` according to the selected provider.

Normalization is provider-aware. Symbols must not be merged merely because their display labels resemble one another.

### Interval

For exact-request sharing, the interval is the provider interval being requested, such as `1m` or `10m`.

For base-interval aggregation, it is the canonical stored interval, normally `1m`. Derived intervals identify their aggregation policy separately and do not cause another upstream request.

### Fetch scope

The fetch scope captures provider request details that materially change the returned candles, including:

- regular trading hours versus extended hours;
- lookback or required candle count;
- adjustment policy;
- futures contract or continuous-contract policy;
- venue or feed when relevant.

User-specific pattern settings do not belong in the fetch scope. **However, a detector's *data requirements* do** — because a shared snapshot must satisfy the most demanding detector among the watches sharing it:

- **Volume-dependent detectors** (e.g. Volume Expansion) require candles that actually carry volume. A provider or endpoint that returns no/zero volume cannot serve those watches; the capability registry must record which providers return volume per asset class, and a shared fetch that omits volume must not be reused for a volume-dependent detector.
- **Lookback-dependent detectors** (Momentum Burst, Range Breakout, Volume Expansion need ≥11 candles; Consecutive Move needs its streak length; Engulfing needs ≥2) require the fetch to return enough history. The shared fetch's lookback must cover the largest requirement among participating watches; a snapshot with too few bars yields `no-data` for the hungrier detector rather than a fabricated result.

So the fetch scope encodes the *union* of data needs (volume + max lookback), while the pattern *choice* stays per-watch in evaluation.

### Time bucket

The time bucket keeps reuse bounded and makes retries deterministic. For example, a scanner refreshing once per minute can use the current UTC minute as the acquisition bucket.

Requests in the same bucket may share a snapshot. A later bucket may reuse a still-fresh snapshot or perform a new provider request according to the cache freshness policy.

## Exact-request sharing

Exact sharing is the first implementation phase.

For a canonical acquisition key:

```text
market-data:v1:<providerScope>:<symbol>:<interval>:<fetchScope>:<timeBucket>
```

the worker performs:

1. Read a fresh candle snapshot from Redis.
2. If present, return it without calling the provider.
3. If absent, attempt to acquire a short distributed single-flight lock.
4. The lock owner fetches from the provider, sanitizes the result, stores it with a bounded TTL, and releases the lock.
5. Other workers briefly wait for the snapshot and then reuse it.
6. If the lock owner fails or times out, another worker may acquire the expired lock and retry.

A plain cache without single-flight protection is insufficient: five concurrent misses could still generate five upstream requests.

### Suggested Redis records

```text
market-data:snapshot:<hash>  -> bounded serialized candles + metadata
market-data:lock:<hash>      -> lock owner token, short TTL
market-data:error:<hash>     -> optional short negative-cache record
```

Snapshot metadata should include:

```ts
interface SharedCandleSnapshot {
  provider: string;
  canonicalSymbol: string;
  interval: string;
  fetchedAt: string;
  sourceTimeBucket: number;
  candles: CandleSnapshot[];
}
```

Only a bounded recent window should be cached. PostgreSQL remains authoritative for each user's watch state and alerts; Redis candle snapshots are disposable.

## Different user intervals

Different intervals are handled using a hybrid strategy.

### Exact interval reuse

If one user watches `AAPL 1m` and two users watch `AAPL 10m`, the first phase creates at most:

- one shared `AAPL 1m` request per applicable fetch window;
- one shared `AAPL 10m` request per applicable fetch window.

The two `10m` users share their request even if they use different patterns.

### Base-interval aggregation

Where safe, the second phase fetches `1m` candles once and derives larger intervals:

```text
AAPL 1m provider snapshot
   ├── 1m detector evaluations
   ├── aggregate to 5m
   ├── aggregate to 10m
   └── aggregate to 15m
```

Aggregation must:

- align buckets to the exchange session and provider timestamps;
- compute open from the first bar and close from the last bar;
- use the maximum high and minimum low;
- sum volume without double counting;
- preserve timezone and daylight-saving behavior;
- distinguish a partially formed candle from a completed candle;
- reject derived output when required base bars are missing or stale.

The scanner initially preserves the existing evaluation behavior: a latest in-progress candle may be evaluated repeatedly as new base bars arrive. Its derived `candleTime` remains the stable start of the interval bucket, so the existing alert uniqueness constraint continues to prevent duplicate alerts for the same direction, detector, and candle. A candle that did not previously qualify may still alert after later data causes it to qualify.

Some providers offer better or more complete native higher-interval candles than can be derived from their `1m` endpoint. The system must maintain a provider capability table and use native intervals when aggregation would reduce correctness.

## Different patterns and thresholds

Patterns and thresholds are not part of the shared acquisition key.

Given one `AAPL 10m` snapshot:

```text
User A: Consecutive Move, minimum 0.25%
User B: Momentum Burst, minimum 0.50%
User C: Range Breakout, minimum 0.10%
```

the scanner runs three evaluations against the same candle array. Each evaluation writes only to its own `server_watch_state`, `server_watch_alert`, `watch_event`, and Web Push recipients.

Detector versions remain part of alert deduplication. Updating one pattern implementation must not invalidate or overwrite another user's alert history.

## Different scan frequencies

Acquisition cadence and user evaluation cadence are separate concepts.

- Market data is refreshed at the fastest cadence currently required by eligible watches within a provider scope.
- Each watch is evaluated only when its PostgreSQL `nextScanAt` is due.
- A slower watch may reuse a snapshot fetched for a faster watch if it is fresh enough.
- A fast watch must not be delayed merely because most users chose a slower frequency.

Example:

```text
User A: AAPL 1m, evaluate every 60 seconds
User B: AAPL 10m, evaluate every 10 minutes
User C: AAPL 10m, evaluate every 5 minutes
```

The acquisition layer may refresh `AAPL 1m` every minute. User A evaluates each minute, User C evaluates every five minutes using the latest derived `10m` candle, and User B evaluates every ten minutes.

PostgreSQL remains the source of truth for each watch's schedule. Redis freshness must not silently change a user's requested evaluation cadence.

### Worked example (all dimensions at once)

Two users, overlapping lists, different everything:

```text
User A: 200 symbols incl. AAPL 1m,  Momentum Burst, 0.50%, evaluate every 60s
User B: 200 symbols incl. AAPL 10m, Consecutive Move, 0.25%, evaluate every 10m
        (150 of the 200 symbols overlap between A and B)
```

- **Today (no sharing):** ~400 provider fetches per A-cycle-equivalent — one per user-watch — scaling linearly with users. AAPL is fetched by A (1m) and by B (10m) independently, plus every overlapping symbol is fetched twice.
- **Phase 1 (exact-request sharing):** fetches collapse to the number of unique `(providerScope, symbol, interval, fetchScope, timeBucket)` keys. The 150 overlapping symbols are fetched once *per distinct interval*; A's 1m and B's 10m of AAPL are still two fetches (different intervals), but a second user on AAPL 10m adds zero. Roughly: `unique(equity symbols) × unique(intervals in use)`, not `users × symbols`.
- **Phase 2 (base-interval aggregation):** AAPL is fetched once at **1m**; B's 10m is **derived**, not fetched. Now overlapping symbols cost **one 1m fetch each** regardless of how many intervals or users consume them.
- **Frequencies:** the 1m acquisition runs every minute for A; B (every 10m) reuses the freshest derived 10m snapshot and triggers **no** extra upstream call. A is never slowed to B's cadence.
- **Patterns/thresholds:** A's Momentum Burst @0.50% and B's Consecutive Move @0.25% both evaluate against the same candle array; each writes only its own state/alerts/push.

The invariant to hold: **upstream requests scale with unique eligible acquisition keys, never with user count** — and the browser contributes zero (see Prerequisites).

## Adaptive acquisition cadence (budget governor)

The rule above ("refresh at the fastest cadence any user requests") answers *demand* but not *affordability*. As the aggregate symbol count grows, a fixed fast cadence will eventually exceed the provider's rate cap. Rather than impose a hard per-symbol limit, the acquisition layer **derives its cadence from the remaining budget**: spend as fast as safely possible when symbols are few, and automatically back off as they grow, so the provider cap is never crossed and cadence degrades smoothly instead of failing.

### The control loop

Per provider scope, on a periodic recompute (not per-scan), set the effective acquisition cadence to:

```text
usable_hourly = hourly_cap × headroom        # e.g. 10,000 × 0.8 = 8,000
usable_daily  = daily_cap  × headroom        # e.g. 100,000 × 0.8 = 80,000

cadence_seconds = max(
  PROVIDER_FLOOR,                             # hard safety floor (e.g. 15s)
  fastest_cadence_any_user_requested,         # never fetch faster than demanded
  ceil(N × 3600        / usable_hourly),      # stay under the hourly cap
  ceil(N × window_secs / usable_daily)        # stay under the daily cap
)
```

- **`N`** is the count of **unique enabled, in-session acquisition keys** for that provider scope — the same set that drives shared fetches (see Sessions below). Disabled and out-of-session watches never contribute to `N`.
- **`window_secs`** is the length of the currently active session window for that scope (e.g. ~12h for a pre+RTH equity session, 24h for crypto). A longer active window forces a slower per-fetch cadence to keep the *daily total* under cap.
- **`headroom`** reserves margin (e.g. 20%) for retries, bursts, and clock skew so the theoretical rate never rides the exact ceiling.
- The `max(...)` means whichever constraint binds wins: with few symbols the user-requested cadence dominates (budget is slack); as `N` grows the budget terms dominate and every watch in the scope slows uniformly.

The caps (`hourly_cap`, `daily_cap`) are **runtime configuration per provider scope**, not build-time constants — upgrading a provider plan is a config change that the governor picks up on its next recompute, with no redeploy. Because the formula takes the `max` over both the hourly and daily terms, the *tighter* limit always paces the system: raising only the daily total while the per-hour rate is unchanged leaves cadence bound by the hourly rate. Both numbers from a plan must be configured together for an upgrade to translate into a faster cadence. The governor scales in both directions — a plan upgrade tightens cadence toward the user-requested/floor limit; a downgrade or a provider-imposed reduction lengthens it — all without code change.

### Behavior across scale

With `headroom = 0.8`, a 10,000/hr + 100,000/day cap, and a 12h active window:

| Unique keys `N` | Hourly floor | Daily floor | Effective cadence |
|---|---|---|---|
| 50 | 23s | 27s | ~27s (or the user's ask, if slower) |
| 200 | 90s | 108s | ~1.8 min |
| 500 | 3.75 min | 4.5 min | ~4.5 min |
| 1000 | 7.5 min | 9 min | ~9 min |

The system spends near real-time for a small deployment and auto-throttles as it grows, with no operator intervention and no hard symbol ceiling.

### Robustness requirements

- **Measured feedback, not just the formula.** The governor must also read *actual* consumption from `provider_request_stats` for the current bucket and tighten cadence if real usage drifts toward the cap. The formula is the target; the meter is the guardrail (retries, negative-cache misses, and derived-interval refreshes all consume real calls the formula does not model).
- **Hysteresis.** Recompute on a coarse interval (e.g. every few minutes) and require a threshold change before adjusting, so cadence does not oscillate when `N` sits on a boundary.
- **Per-provider scope.** Each provider has its own cap, its own `N`, and its own governor; throttling Tiingo must not affect Polygon.
- **Fairness.** When the budget binds, the slowdown applies uniformly across the scope's keys; no single user's fast request can starve the shared budget for everyone else.
- **Observability.** Emit the current effective cadence, `N`, and headroom utilization as metrics so the throttle is legible in the admin provider-stats view.

## Sessions and market calendars

Session eligibility remains per watch. A watch outside its configured session is deferred without triggering an acquisition solely for that watch.

The same exclusion applies to **disabled watches**. Users can switch a whole asset class off (stored as `server_watch.enabled = false`); disabled watches must be excluded from acquisition grouping entirely — they must never contribute a symbol/interval to a shared fetch, exactly like an out-of-session watch. A shared fetch is driven only by the set of currently **enabled, in-session** watches.

Sharing is allowed when the fetched candle scope contains sufficient data for every participating watch. A broad extended-hours fetch may be filtered independently for regular-hours evaluation, provided that:

- session filtering is deterministic;
- aggregation buckets use the correct session anchor;
- no pre-market bar leaks into an RTH-only detector window;
- the provider license permits the shared request.

Futures and crypto require their own calendar and maintenance-window rules. A single equity session helper must not be applied to all asset classes.

## Scheduler and worker responsibilities

### Scheduler

The scheduler continues selecting due `server_watch` rows from PostgreSQL. The first phase does not require grouping all watches into one large job; independent watch jobs can call the shared acquisition service and still deduplicate provider requests through Redis.

This minimizes migration risk and preserves existing retry behavior.

A later optimization may group due watches by acquisition key and enqueue one acquisition job plus evaluation jobs. That should be considered only if per-watch queue overhead becomes material.

### Acquisition service

Add a server-only service with a narrow interface:

```ts
interface SharedCandleService {
  getCandles(request: MarketDataRequest): Promise<SharedCandleSnapshot>;
}
```

It owns:

- provider selection and entitlement partitioning;
- canonical symbols and fetch scopes;
- cache lookup and TTL policy;
- distributed single-flight locking;
- provider requests and timeouts;
- sanitization and bounded snapshots;
- safe interval aggregation;
- acquisition metrics.

It does not own pattern detection, user state, alert creation, SSE, or Web Push.

### Watch evaluator

The existing worker becomes an evaluator:

1. Load the user watch.
2. Confirm it remains enabled and in session.
3. Request a candle snapshot from `SharedCandleService`.
4. Run the watch's detector and threshold.
5. Transactionally update that watch's state, alert, and event.
6. Notify only that user.

## Freshness and TTL policy

TTL should reflect the smallest interval and normal provider delay.

Initial guidance:

- single-flight lock: 10–30 seconds, always shorter than provider timeout plus a small recovery margin;
- successful `1m` snapshot: approximately 45–75 seconds;
- successful higher-interval snapshot: no longer than the configured scan frequency and normally a small fraction of the interval;
- provider error negative cache: 5–15 seconds to prevent a retry storm;
- derived snapshots: no longer than their underlying base snapshot.

These values must be configuration, not scattered constants. The cache record's `fetchedAt` is authoritative for freshness; Redis TTL alone is not sufficient metadata.

## Failure and recovery behavior

### Redis unavailable

The scanner may fall back to direct provider fetching under the existing global rate limiter, or deliberately fail and retry based on an environment-controlled policy. Production should prefer bounded degradation over an uncontrolled request storm.

### Lock owner crashes

The lock expires automatically. Waiting workers use bounded jitter and may retry after expiration. Lock release must compare the owner token so one worker cannot release another worker's lock.

### Provider failure

Store a very short negative-cache record for the acquisition key. All affected watches receive an error or retry outcome without each causing another immediate provider request.

One provider scope's failure must not poison another provider scope.

### Partial or stale base candles

Do not derive a larger interval if required base candles are inconsistent, duplicated, out of order, or older than the accepted freshness window. Fall back to a native interval request where supported; otherwise mark the affected evaluation `no-data` or `error` without fabricating candles.

### Redis data loss

No durable user data is lost. Subsequent evaluations repopulate snapshots from the provider. PostgreSQL schedules, watch states, alerts, and events remain authoritative.

## Rate limiting

Rate limits apply to actual upstream provider calls, not cache hits or pattern evaluations.

Use a provider-scoped distributed limiter so multiple scanner processes share the same quota. Note the **current** implementation is a single global BullMQ *worker* limiter (`SCANNER_RATE_MAX` per `SCANNER_RATE_DURATION_MS`, default 10/sec) that throttles job throughput regardless of provider — it does not partition by `providerScope` and does not coordinate across multiple worker containers. Migrating to a provider-scoped, Redis-backed distributed limiter is part of this work; until then, a single worker's global cap is the only protection and it must be tuned below the provider's real limit (which is per-plan, e.g. Tiingo Power vs Polygon free — the mismatch that caused live 429s in the single-user rollout). Metrics must distinguish:

- evaluation jobs;
- cache hits;
- cache misses;
- lock waiters;
- upstream requests;
- provider throttles;
- provider errors.

Retries must re-enter acquisition through the shared cache rather than bypassing it.

## Privacy and security

- Candle snapshots contain public or licensed market data, never user watch metadata.
- Redis keys must not contain user IDs unless provider entitlement partitioning requires a non-reversible credential identifier.
- Credentials must not appear in cache values.
- Per-user state and alerts remain keyed by `watchId` and `userId` in PostgreSQL.
- A user must never receive another user's watch state, alert, SSE event, or push notification.
- Sharing must comply with provider licensing and exchange redistribution rules.
- Administrator metrics should report aggregate key hashes and counts rather than private watchlist contents where practical.

## Observability

Add counters and timing histograms for:

```text
scanner_evaluations_total
market_data_cache_hits_total
market_data_cache_misses_total
market_data_singleflight_waiters_total
market_data_upstream_requests_total
market_data_upstream_errors_total
market_data_aggregation_total
market_data_aggregation_failures_total
market_data_fetch_duration_ms
market_data_cache_age_ms
```

Useful derived indicators:

- **request sharing ratio:** evaluations divided by upstream requests;
- **cache hit rate:** hits divided by all acquisition attempts;
- **single-flight effectiveness:** waiters served per lock-owner fetch;
- **provider error fan-out:** affected evaluations per failed upstream call;
- **aggregation coverage:** derived interval evaluations divided by all higher-interval evaluations.

Logs should use a hashed acquisition key, provider name, interval, cache result, and duration. They must not log secrets.

## Data model impact

The first phase requires no PostgreSQL schema change.

Existing tables continue to model:

- `server_watch`: user-specific configuration and schedule;
- `server_watch_state`: user-specific latest evaluation;
- `server_watch_alert`: user-specific deduplicated alerts;
- `watch_event`: user-specific delivery stream.

Redis adds disposable acquisition snapshots and locks.

If exact sharing and aggregation later require durable provider capability or canonical-symbol configuration, add explicit tables only after those rules can no longer be safely maintained as versioned code.

## Suggested implementation sequence

### Phase 0 — Baseline

- Measure upstream calls by provider, symbol, interval, and minute.
- Measure evaluations and provider errors.
- Add a load test with multiple users watching identical symbols.

### Phase 1 — Exact-request cache ✅ implemented

- Extract provider fetching behind `SharedCandleService`. **Done** (`lib/scanner/shared/shared-candle-service.ts`).
- Create and test canonical acquisition keys. **Done** (`acquisition-key.ts`).
- Cache sanitized bounded snapshots in Redis. **Done** (`cache-store.ts`, snapshot TTL + candle cap).
- Keep the existing per-watch queue and evaluation transaction. **Done** — only the fetch is shared; evaluation/state/alerts/events/push unchanged.

### Phase 2 — Distributed single-flight ✅ implemented

- Add token-owned Redis locks and bounded jitter. **Done** (`cache-store.ts` SET-NX + compare-and-delete Lua; jittered waiter loop).
- Add short negative caching. **Done** (`market-data:error:<hash>`, per-key).
- Verify concurrent equivalent jobs produce one upstream call. **Done** (in-process coalescing + cross-process lock; tests cover both).

### Phase 3 — Provider capability registry ✅ implemented

- Define which native intervals, lookbacks, sessions, and aggregation paths are safe per provider and asset class. **Done** (`provider-capabilities.ts`).
- Partition cache keys by entitlement scope. **Partial** — keys carry a `providerScope`, but only a single `:server` scope exists until Prerequisite 1 lands.
- Add symbol normalization fixtures for equities, futures, and crypto. **Done** (`canonical-symbol.ts` + tests).

### Phase 4 — Base-interval aggregation ⚙️ implemented, flag-gated OFF

- Implement pure aggregation functions with exchange-aligned buckets. **Done** (`aggregate.ts`).
- Preserve in-progress candle identity and completed-candle status. **Done** (latest partial bucket kept with stable start time).
- Compare derived output against native provider candles in shadow metrics. **Not done** — rollout chose a simpler flag-off gate instead of a shadow-compare harness.
- Enable per provider and asset class only after parity meets an agreed threshold. **Gated** behind `SCANNER_AGGREGATION` (default off) + registry `aggregatableFrom1m`. Note: the shared 1m snapshot is bounded by `maxSnapshotCandles` (~25h) — raise before enabling in production if intraday-change prior-day lookback matters.

### Phase 5 — Scheduler grouping, if needed ⏭️ skipped

- Consider acquisition-group jobs only if queue volume or database reads become a measured bottleneck. **Skipped** — no measured bottleneck; per-watch jobs already dedupe through Redis.
- Do not combine user evaluation transactions or notifications.

### Phase 6 — Adaptive cadence governor ⚙️ implemented, flag-gated OFF

- Compute the effective acquisition cadence per provider scope from the budget formula. **Done** (`governor.ts` `computeCadenceSeconds`).
- Drive `N` from the set of unique enabled, in-session acquisition keys. **Done** (`acquisition-inventory.ts`).
- Feed measured usage from `provider_request_stats` back into the governor and tighten when real usage drifts toward the cap. **Done** (`measuredCadenceSeconds`), at daily granularity (the stats table's resolution); hourly-resolution feedback would need a schema change.
- Apply hysteresis on a coarse recompute interval; emit effective cadence, `N` as metrics. **Done** (`CadenceGovernor` hysteresis; recompute loop logs cadence + `N`). Headroom-utilization metric not yet emitted.
- Gated behind `SCANNER_GOVERNOR` (default off). When off, acquisition uses the fixed bucket. Caps are runtime config (`SCANNER_BUDGET_*`, per-scope `SCANNER_PROVIDER_BUDGETS`).

## Acceptance criteria

### Exact sharing

- Five concurrent watches from five users with the same provider scope, symbol, interval, and fetch scope cause at most one upstream call per acquisition bucket.
- All five watches are evaluated with their own pattern and threshold.
- An alert for one user is not visible or delivered to another.
- Retried jobs reuse the existing snapshot when fresh.

### Different patterns

- Users watching the same symbol and interval with different pattern IDs produce independent, correct outcomes from one candle snapshot.
- Pattern-version alert deduplication remains unchanged.

### Different intervals

- Users sharing the same native interval reuse one provider request.
- When aggregation is enabled, derived OHLCV matches exchange-aligned native candles within defined parity tolerances.
- Missing base bars never produce fabricated complete candles.
- In-progress derived candles retain a stable interval bucket timestamp.

### Different frequencies

- Fast watches receive evaluations at their configured cadence.
- Slow watches do not create additional provider calls when a sufficiently fresh shared snapshot exists.
- PostgreSQL `nextScanAt` remains authoritative.

### Adaptive cadence

- With a small symbol count, effective cadence equals the fastest user-requested cadence (budget is slack).
- As the unique-key count grows, effective cadence lengthens automatically and aggregate upstream usage stays under the configured provider cap (minus headroom).
- The governor never crosses the cap even when measured usage (retries, misses) exceeds the theoretical formula.
- No hard per-symbol ceiling is imposed; the cap alone paces the system.

### Concurrency and failure

- Concurrent cache misses use one lock owner.
- Lock expiration recovers from worker termination.
- Provider failure does not cause one immediate retry request per affected user.
- Redis loss does not lose durable watches or alerts.

### Provider isolation

- Requests using different entitlement scopes never share cached data accidentally.
- Redis keys and logs contain no raw credentials.

## Test strategy

### Unit tests

- canonical request key construction;
- provider-scope partitioning;
- symbol normalization;
- TTL and freshness decisions;
- OHLCV aggregation and bucket alignment;
- in-progress and completed candle handling;
- missing, duplicated, and out-of-order base bars;
- lock-token ownership.

### Integration tests

- multiple user watches with one exact acquisition key;
- different patterns and thresholds using one snapshot;
- exact interval sharing;
- base-interval aggregation;
- provider timeout and negative-cache fan-out;
- worker crash while holding a lock;
- Redis flush and repopulation;
- per-user alert and event isolation.

### Load tests

Compare:

1. 1,000 users watching 20 identical symbols;
2. 1,000 users watching a mixed long tail;
3. mixed `1m`, `5m`, and `10m` intervals;
4. several patterns and thresholds per shared symbol;
5. multiple scanner workers competing on the same Redis instance.

The primary success measure is upstream requests per unique eligible acquisition key, not jobs processed per second.

## Decisions captured by this specification

- Keep `server_watch` user-specific.
- Share market-data acquisition, not user evaluation or alert state.
- Implement exact-request sharing before interval aggregation.
- Use distributed single-flight in addition to caching.
- Partition sharing by provider entitlement.
- Preserve per-watch PostgreSQL scheduling.
- Preserve current intrabar evaluation behavior during the optimization.
- Treat Redis snapshots as disposable and PostgreSQL user state as authoritative.

