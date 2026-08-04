# Shared Market-Data Scanning Across Users

## Status

**Partially implemented (server-side).** Phases 1–4 and 6 provide exact-request
sharing and advisory cadence control. Phase 7 is now underway: the pieces that
make acquisition provider-owned and per-symbol are built but gated OFF for a safe
rollout —

- **Symbol-only inventory** (`acquisitionInterval`): with aggregation on, a symbol
  watched at any mix of minute intervals collapses to one 1m base series, so the
  governor's `N` counts symbols, not `(symbol, interval)`.
- **Derived-vs-native parity harness** (`aggregation-parity.ts` + `dev-parity.ts`):
  the gate for trusting derived candles before enabling `SCANNER_AGGREGATION`.
- **Evaluation-only Scan Now**: manual scans re-run the detector against cached
  data only (`getCachedCandlesForWatch`) and never trigger a provider request.
- **Physical-request quota gate** (`request-quota.ts`): Redis hourly + daily
  counters per provider scope, checked at the scanner's single upstream fetch.
  Counts by default (`SCANNER_QUOTA`); refuses over-budget fetches only when
  `SCANNER_QUOTA_ENFORCE` is on (default off → observe + log).

Phase 4 aggregation and quota enforcement both remain flag-OFF pending a clean
parity run and an observation window. The remaining Phase 7 work is a
provider-owned acquisition scheduler that refreshes each unique base series on the
governor's cadence independent of user intervals, extending the quota gate to the
chart/tester/web paths, reconciling the Redis counters with the durable Postgres
audit, and an IBKR-specific futures-aggregation policy. See "Implementation
status" below.

### Implementation status

| Item | State | Notes |
|---|---|---|
| Phase 1 — exact-request shared cache | ✅ live | `lib/scanner/shared/`; worker fetch routed through `SharedCandleService` |
| Phase 2 — distributed single-flight + negative cache | ✅ live | token-owned Redis locks, jittered waiters, per-key negative cache |
| Phase 3 — provider capability registry + symbol normalization | ✅ live | provider-aware canonical symbols; capability registry |
| Intraday equity fetch scope | 🚀 pending deploy | scanner requests only the current New York trading date and filters per-watch session before evaluation |
| Phase 4 — base-interval aggregation | ⚙️ built, OFF | enable with `SCANNER_AGGREGATION=true` |
| Phase 5 — scheduler grouping | ⏭️ skipped | "only if needed"; no measured queue pressure |
| Phase 6 — adaptive cadence governor | ⚠️ advisory, pending deploy | formula + daily feedback built; inventory now folds to the fetched interval (symbol-only when aggregation is on); still no distributed hard quota gate |
| Phase 7 — provider-owned base-series acquisition | ⚙️ partially built | symbol-only inventory (`acquisitionInterval`) ✅ and derived-vs-native parity harness (`aggregation-parity.ts` + `dev-parity.ts`) ✅; still to do: flip `SCANNER_AGGREGATION` after a clean parity run, provider-owned scheduler independent of user interval, staggered fair scheduling |
| Physical-request quota enforcement | ⚙️ scanner path built, observe-default | `request-quota.ts` Redis hourly + daily counters per provider scope, gated at the scanner's single upstream fetch (`fetchAndStore`). `SCANNER_QUOTA` counts (default on); `SCANNER_QUOTA_ENFORCE` blocks (default off → observe + log). Still to do: extend the gate to chart/tester/anonymous/web paths and reconcile the Redis counters with the durable Postgres audit |
| Evaluation-only Scan Now | ❌ next work | manual scans must evaluate cached data without accelerating provider acquisition |
| Prerequisite 1 — server-authoritative provider config | ❌ not done | scanner still uses server env keys; per-user credentials never reach it |
| Prerequisite 2 — authenticated browser is a pure viewer | ✅ done (signed-in) | `MarketWatcher.tsx` skips per-symbol fetching when authenticated (`if (isAuthenticatedRef.current) return`) and renders from `/api/watch/state` + `/api/watch/events` SSE. Only signed-OUT sessions still fetch client-side (no server watches to share). |
| Provider-scoped distributed rate limiter | ❌ not done | still the single global BullMQ worker limiter |
| Observability counters (hit rate, sharing ratio) | ❌ not done | snapshots written; metrics not yet emitted |

For **signed-in** users the browser is now a viewer (snapshot + SSE, no automatic
per-symbol fetching). The current server scanner shares only an exact provider,
symbol, interval, fetch-scope, and time-bucket request. It does **not** yet fetch
each unique symbol only once when users select different candle intervals.
Signed-out sessions and detailed chart/tester requests are additional server
request paths and must join the same physical-request quota gate in Phase 7.

## Related specification

This document extends [Server-Side Market Scanner and Live Watch Clients](./server-side-market-scanner.md). The existing scanner remains responsible for user watches, pattern evaluation, alert persistence, SSE events, and Web Push. This specification changes how scanner jobs acquire candles so equivalent watches do not repeatedly call a market-data provider.

## Summary

The current scanner schedules and processes one job per user watch. A watch is uniquely identified by `(userId, symbol, interval)`, and each job fetches candles before evaluating that user's detector. Consequently, five users watching `AAPL` at `10m` can generate approximately five equivalent provider requests per scan window.

Market candles are not user-specific. The scanner should acquire an eligible candle snapshot once and reuse it across all watches that can legally and technically share that data. Pattern selection, thresholds, schedules, watch state, alerts, events, and notifications remain isolated per user.

The implementation proceeds in three stages:

1. **Exact-request sharing:** deduplicate concurrent and recently completed fetches with the same provider entitlement, canonical symbol, requested interval, fetch scope, and time bucket.
2. **Base-interval aggregation:** where provider semantics permit, fetch a small canonical interval such as `1m` once and derive `5m`, `10m`, `15m`, and other supported intervals.
3. **Provider-owned acquisition:** schedule the canonical base series independently of user evaluation, stagger unique symbols fairly, and enforce the provider's physical hourly and daily request budgets across the whole application.

Exact-request sharing delivers immediate protection against identical duplicate
calls. It is not the final scaling boundary: the target for aggregatable
providers such as Tiingo is one base-series acquisition per unique symbol,
regardless of users, candle intervals, patterns, evaluation schedules, or
manual scan taps.

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
- `ibkr-cme:server-account`
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

The user's candle interval is an **evaluation preference**, not a provider
acquisition setting. For a provider/asset class that supports safe base-series
aggregation, changing a watch from `1m` to `5m` or `10m` must not create another
upstream series, change the provider cadence, or consume more request quota.

The final acquisition identity for Tiingo equities is therefore approximately:

```text
(providerScope, canonicalSymbol, baseFetchScope)
```

The requested display/evaluation interval is deliberately absent. It is applied
after acquisition when the scanner derives candles locally.

### Transitional exact interval reuse

If one user watches `AAPL 1m` and two users watch `AAPL 10m`, the first phase creates at most:

- one shared `AAPL 1m` request per applicable fetch window;
- one shared `AAPL 10m` request per applicable fetch window.

The two `10m` users share their request even if they use different patterns.
This is the currently implemented Phase 1 behavior, not the target steady state.

### Required base-interval aggregation

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

For providers that cannot safely aggregate from one base interval, the
provider-native interval remains part of the acquisition identity. This is a
documented capability exception, not a reason to let user intervals influence
Tiingo's acquisition inventory. IBKR futures require a separate parity and
exchange-session alignment pass before they can move to a canonical 1m series.

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

Acquisition cadence and user evaluation cadence are separate concepts and must
be implemented by separate schedulers.

- Market data is refreshed at a server-owned cadence derived from provider
  policy, the number of unique acquisition series, market calendars, and
  remaining quota.
- Each watch is evaluated only when its PostgreSQL `nextScanAt` is due.
- A slower watch may reuse a snapshot fetched for a faster watch if it is fresh enough.
- A user's candle interval or evaluation frequency never accelerates or slows
  provider acquisition.
- A manual scan evaluates the freshest cached series and never bypasses the
  acquisition scheduler.

Example:

```text
User A: AAPL 1m, evaluate every 60 seconds
User B: AAPL 10m, evaluate every 10 minutes
User C: AAPL 10m, evaluate every 5 minutes
```

The server may refresh the shared `AAPL 1m` series every 72 seconds because of
the current Tiingo budget. User A evaluates each minute using the freshest
available series, User C every five minutes using a derived `10m` view, and User
B every ten minutes. None of those evaluation schedules changes the 72-second
provider cadence.

PostgreSQL remains the source of truth for each watch's requested schedule. The
provider acquisition inventory and schedule are separate server-owned state.

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
- **Provider-owned acquisition:** the 1m acquisition cadence comes only from server provider policy and quota. Neither A's nor B's interval or evaluation schedule changes it.
- **Patterns/thresholds:** A's Momentum Burst @0.50% and B's Consecutive Move @0.25% both evaluate against the same candle array; each writes only its own state/alerts/push.

The invariant to hold for Tiingo equities: **upstream requests scale with unique
eligible symbols, never with user count, selected candle intervals, pattern
settings, evaluation frequency, or Scan Now taps**. Internal evaluations and
database writes may still scale with user watches, but they make no provider
request.

## Adaptive acquisition cadence (budget governor)

As the aggregate symbol count grows, a fixed fast cadence eventually exceeds
the provider's rate cap. The acquisition layer therefore derives cadence from
server-owned provider policy and the remaining budget: spend as fast as safely
possible when symbols are few, and automatically back off as they grow. User
watch settings do not participate in this calculation.

### The control loop

Per provider scope, on a periodic recompute (not per-scan), set the effective acquisition cadence to:

```text
usable_hourly = hourly_cap × headroom        # e.g. 10,000 × 0.8 = 8,000
usable_daily  = daily_cap  × headroom        # e.g. 100,000 × 0.8 = 80,000
usable_bytes  = monthly_bytes × headroom     # e.g. 40 GB × 0.8 = 32 GB

cadence_seconds = max(
  PROVIDER_FLOOR,                             # hard safety floor (e.g. 15s)
  PROVIDER_TARGET,                            # optional server-owned target
  ceil(N × 3600        / usable_hourly),      # stay under the hourly cap
  ceil(N × window_secs / usable_daily),       # stay under the daily cap
  ceil(monthly_bar_seconds × bytes_per_bar
       / usable_bytes)                        # stay under monthly bandwidth
)
```

- **`N`** is the count of unique enabled acquisition series for that provider scope. For Tiingo equities this is unique canonical symbols, not symbol × user interval.
- **`window_secs`** is the server-owned provider/market acquisition window (for example 16h for US extended-hours equities), not a user's selected evaluation session. A longer active window forces a slower per-fetch cadence to keep the *daily total* under cap.
- **`monthly_bar_seconds`** estimates each distinct response's bars multiplied
  by active seconds and trading days. It lets the governor account for the fact
  that repeatedly downloading a full current-day response costs more bandwidth
  as the session grows.
- **`headroom`** reserves margin (e.g. 20%) for retries, bursts, and clock skew so the theoretical rate never rides the exact ceiling.
- The `max(...)` means whichever constraint binds wins. With few symbols the provider floor/target dominates; as `N` grows the budget terms dominate and every acquisition series in the scope slows uniformly.

The caps (`hourly_cap`, `daily_cap`) are **runtime configuration per provider scope**, not build-time constants — upgrading a provider plan is a config change that the governor picks up on its next recompute, with no redeploy. Because the formula takes the `max` over both the hourly and daily terms, the *tighter* limit always paces the system: raising only the daily total while the per-hour rate is unchanged leaves cadence bound by the hourly rate. Both numbers from a plan must be configured together for an upgrade to translate into a faster cadence. The governor scales in both directions — a plan upgrade tightens cadence toward the provider floor/target; a downgrade or a provider-imposed reduction lengthens it — all without code change.

### Behavior across scale

With `headroom = 0.8`, a 10,000/hr + 100,000/day cap, and a
16h extended-hours equity acquisition window, the usable budgets are 8,000/hr
and 80,000/day. The daily budget allows an average of 5,000 requests/hour and is
normally tighter than the hourly budget:

| Unique Tiingo symbols `N` | Effective cadence per symbol | Predicted requests/hour |
|---:|---:|---:|
| 20 | 15s provider floor | 4,800 |
| 50 | 36s | 5,000 |
| 100 | 72s | 5,000 |
| 200 | 2.4 min | 5,000 |
| 500 | 6 min | 5,000 |
| 1,000 | 12 min | 5,000 |
| 5,000 | 60 min | 5,000 |

One hundred users and one thousand users watching the same 100 symbols therefore
have the same provider acquisition cost: approximately one request per symbol
every 72 seconds. Their evaluation workload differs, but Tiingo usage does not.

The formula selects a safe average cadence; it is not itself a hard limiter.
The acquisition scheduler must stagger symbols evenly across the window instead
of releasing the full inventory in a burst.

### Robustness requirements

- **Measured feedback, not just the formula.** The governor must read actual physical HTTP consumption from hourly and daily counters and tighten cadence based on remaining quota and remaining active-session time.
- **Hard enforcement.** A provider-scoped Redis quota gate must atomically reserve capacity before every physical HTTP attempt. The cadence formula is an optimizer; the quota gate is the safety boundary.
- **Whole-application coverage.** Scanner acquisition, charts, the pattern tester, anonymous requests, retries, and fallback endpoint attempts using the same credential must use the same quota gate.
- **Physical attempts, not logical operations.** If one provider operation tries a primary endpoint and then a compatibility endpoint, both HTTP attempts consume and record quota.
- **Hysteresis.** Apply budget-required slowdowns immediately. Require a
  threshold change only before speeding back up, so cadence does not oscillate
  when `N` sits on a boundary and hysteresis never consumes reserved headroom.
- **Per-provider scope.** Each provider has its own cap, its own `N`, and its own governor; throttling Tiingo must not affect Polygon.
- **Fairness.** Acquire the stalest due symbol first and stagger the inventory; no user action or hot symbol can starve the rest of the scope.
- **Observability.** Emit the current effective cadence, `N`, and headroom utilization as metrics so the throttle is legible in the admin provider-stats view.

## Sessions and market calendars

Session eligibility remains per watch for evaluation. Acquisition eligibility
uses a server-owned market calendar and provider feed window. A user's `rth`,
`pre`, or `ext` choice filters the shared base series during evaluation; it does
not redefine the provider's cadence or quota window.

The same exclusion applies to **disabled watches**. Users can switch a whole
asset class off (stored as `server_watch.enabled = false`); disabled watches do
not create acquisition demand. A symbol remains in the provider inventory while
at least one enabled watch consumes it, and it is fetched only while the
server-owned market calendar says its feed is active.

Sharing is allowed when the fetched candle scope contains sufficient data for every participating watch. A broad extended-hours fetch may be filtered independently for regular-hours evaluation, provided that:

- session filtering is deterministic;
- aggregation buckets use the correct session anchor;
- no pre-market bar leaks into an RTH-only detector window;
- the provider license permits the shared request.

Futures and crypto require their own calendar and maintenance-window rules. A single equity session helper must not be applied to all asset classes.

## Scheduler and worker responsibilities

### Scheduler

Phase 7 separates scheduling into two independent loops:

1. **Acquisition scheduler:** maintains one due record per provider acquisition
   series, computes a server-owned cadence, orders due series by staleness, and
   spreads requests evenly through the available provider budget.
2. **Evaluation scheduler:** selects due `server_watch` rows, derives the user's
   requested interval and session view from the latest base snapshot, then runs
   the user's detector. It cannot call the provider directly.

The existing per-watch scheduler remains during migration, but provider fetching
must be removed from that worker before the unique-symbol invariant is declared
complete. Evaluation jobs may remain per-watch unless queue or database pressure
shows that fan-out grouping is needed.

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

In Phase 7 it also owns the rolling base series and exposes read-only derived
snapshots to evaluators. Only the acquisition scheduler may refresh that series.

It does not own pattern detection, user state, alert creation, SSE, or Web Push.

### Watch evaluator

The existing worker becomes an evaluator:

1. Load the user watch.
2. Confirm it remains enabled and in session.
3. Read a candle snapshot from `SharedCandleService`; never initiate acquisition.
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

Production acquisition fails closed or enters an explicitly bounded degraded
mode. It must not bypass the distributed quota gate with an uncontrolled direct
provider fetch. User evaluations may continue from a sufficiently fresh local
or persisted snapshot and otherwise return `no-data`/`error` until coordination
recovers.

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

Use a provider-scope/credential-scope distributed limiter so all application
processes share the same quota. It must atomically enforce both an hourly budget
and a daily budget; satisfying one limit never permits crossing the other. The
configured headroom is reserved before scheduling normal acquisition.

The quota permit sits immediately around the physical HTTP request, below the
scanner/chart/tester routing layers. This ensures every attempt is counted,
including retries and a second endpoint attempted by a fallback provider. A
request without a permit is deferred or rejected; it never proceeds optimistically.

The **current** implementation is only a single global BullMQ *worker* limiter
(`SCANNER_RATE_MAX` per `SCANNER_RATE_DURATION_MS`, default 10/sec). It throttles
evaluation job throughput regardless of provider, does not coordinate multiple
worker containers, does not cover web request paths, and does not enforce either
the Tiingo hourly or daily physical-request quota. It must remain described as a
temporary guard, not the completed provider limiter.

Metrics must distinguish:

- evaluation jobs;
- cache hits;
- cache misses;
- lock waiters;
- upstream requests;
- provider throttles;
- provider errors.

They must additionally report remaining hourly permits, remaining daily permits,
physical attempts by endpoint, predicted versus actual requests/hour, oldest
acquisition age, and acquisition-schedule lag.

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
- Compare derived output against native provider candles in shadow metrics. **Done (offline harness)** — `aggregation-parity.ts` (`compareDerivedToNative`) aligns derived-from-1m against native bucket-by-bucket within OHLC/volume tolerances, ignores the still-forming latest bucket, and reports every mismatch. Run it over representative symbols via `dev-parity.ts` and confirm all reports are OK before enabling the flag. A continuously-sampled live shadow hook is still optional.
- Enable per provider and asset class only after parity meets an agreed threshold. **Gated** behind `SCANNER_AGGREGATION` (default off) + registry `aggregatableFrom1m`. Note: the shared 1m snapshot is bounded by `maxSnapshotCandles` (~25h) — raise before enabling in production if intraday-change prior-day lookback matters.

### Phase 5 — Scheduler grouping, if needed ⏭️ skipped

- Consider acquisition-group jobs only if queue volume or database reads become a measured bottleneck. **Skipped** — no measured bottleneck; per-watch jobs already dedupe through Redis.
- Do not combine user evaluation transactions or notifications.

### Phase 6 — Adaptive cadence governor ⚠️ advisory, pending deployment

- Compute the effective acquisition cadence per provider scope from the budget formula. **Done** (`governor.ts` `computeCadenceSeconds`).
- Drive `N` from the set of unique enabled acquisition series. **Done (flag-consistent)** — `acquisition-inventory.ts` now folds each watch onto the interval actually fetched (`acquisitionInterval`): with `SCANNER_AGGREGATION` on and an `aggregatableFrom1m` provider, every minute-based interval collapses to one 1m base series, so `N` counts unique symbols, not `(symbol, interval)`. With the flag off it counts per interval as before, so inventory always mirrors the fetch path.
- Feed measured usage from `provider_request_stats` back into the governor and tighten when real usage drifts toward the cap. **Partial** — daily logical-operation feedback exists, but hourly physical-request accounting and enforcement do not.
- Apply hysteresis on a coarse recompute interval; emit effective cadence, `N` as metrics. **Done** (`CadenceGovernor` hysteresis; recompute loop logs cadence + `N`). Headroom-utilization metric not yet emitted.
- Enabled by default through `SCANNER_GOVERNOR`. The cadence takes the strictest
  hourly-request, daily-request, and estimated monthly-bandwidth term, all with
  configurable headroom. When explicitly disabled, acquisition uses the fixed
  bucket. Caps are runtime config (`SCANNER_BUDGET_*`, per-scope
  `SCANNER_PROVIDER_BUDGETS`).

### Phase 7 — Provider-owned unique-symbol acquisition ❌ next work

- Change Tiingo inventory from distinct `(canonicalSymbol, interval)` keys to
  distinct canonical symbols with one `1m` base series per provider/fetch scope.
- Make provider floor, target cadence, market calendar, and budget window
  server-owned configuration. Remove user interval, user evaluation frequency,
  and user session length from acquisition cadence calculations.
- Enable Tiingo base-series aggregation only after native-versus-derived parity
  covers supported intervals, missing bars, partial candles, DST, and extended
  hours. Remove native interval fallback as an automatic quota bypass; a parity
  failure yields bounded no-data/error unless a separately budgeted exception is
  configured.
- Introduce a provider acquisition scheduler that staggers unique symbols fairly
  and refreshes the stalest due series first.
- Make the watch worker evaluation-only. It reads the latest base series, applies
  the user's session filter, derives the requested interval, evaluates the
  pattern, and persists isolated user state.
- Make `Scan Now All` mark evaluations due without marking provider acquisition
  due. Repeated taps must produce zero additional upstream calls.
- Add a Redis-backed quota gate for physical hourly and daily requests, keyed by
  provider credential scope and shared by scanner, web, charts, tester,
  anonymous requests, retries, and provider fallback attempts.
- Add hourly-resolution physical-request accounting; retain daily durable totals
  for audit and reconciliation.
- Treat Redis/quota coordination failure as fail-closed or explicitly bounded
  degradation, never unlimited direct fetching.
- Add a separate provider-owned acquisition policy for IBKR. Do not enable 1m
  futures aggregation until contract/session bucket alignment and historical
  pacing parity are verified.

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
- For Tiingo, one symbol watched at any combination of `1m`, `5m`, `10m`,
  `15m`, and other approved derived intervals produces one base-series
  acquisition schedule.
- Changing a user's candle interval does not change unique acquisition count,
  provider cadence, or upstream request volume.
- Derived OHLCV matches exchange-aligned native candles within defined parity tolerances.
- Missing base bars never produce fabricated complete candles.
- In-progress derived candles retain a stable interval bucket timestamp.

### Different frequencies

- Watches receive evaluations according to their PostgreSQL schedule using the
  freshest available shared snapshot.
- Changing a user evaluation frequency creates no provider acquisition request
  and does not change provider cadence.
- PostgreSQL `nextScanAt` remains authoritative for evaluation only.
- `Scan Now All` makes evaluations due and causes zero provider requests by itself.

### Adaptive cadence

- With a small symbol count, effective cadence equals the server-owned provider
  floor/target when budget is slack.
- As the unique-symbol count grows, effective cadence lengthens automatically and aggregate upstream usage stays under both configured provider caps minus headroom.
- The distributed quota gate never crosses the hourly or daily cap even when
  retries, misses, fallback endpoints, manual requests, charts, or multiple
  application processes exceed the theoretical formula.
- No hard per-symbol ceiling is imposed; the cap alone paces the system.
- Due symbols are staggered fairly rather than emitted as synchronized bursts.

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
- symbol-only Tiingo inventory regardless of requested candle intervals;
- provider cadence calculations ignore user evaluation interval/frequency;
- atomic hourly and daily quota permit reservation;
- physical retry and fallback-attempt accounting;
- fair oldest-due acquisition ordering and staggering.

### Integration tests

- multiple user watches with one exact acquisition key;
- different patterns and thresholds using one snapshot;
- exact interval sharing;
- base-interval aggregation;
- provider timeout and negative-cache fan-out;
- worker crash while holding a lock;
- Redis flush and repopulation;
- per-user alert and event isolation.
- repeated `Scan Now All` evaluations with zero acquisition calls;
- scanner, chart, tester, and anonymous paths sharing one credential quota;
- multiple worker/web processes contending for the last hourly/daily permits;
- Redis loss failing closed without an uncontrolled provider request.

### Load tests

Compare:

1. 1,000 users watching 20 identical symbols;
2. 1,000 users watching a mixed long tail;
3. mixed `1m`, `5m`, and `10m` intervals;
4. several patterns and thresholds per shared symbol;
5. multiple scanner workers competing on the same Redis instance.

The primary Tiingo success measure is physical upstream requests per unique
eligible symbol, not jobs processed per second. Mixed user intervals must not
increase that number.

## Decisions captured by this specification

- Keep `server_watch` user-specific.
- Share market-data acquisition, not user evaluation or alert state.
- Implement exact-request sharing before interval aggregation.
- Use distributed single-flight in addition to caching.
- Partition sharing by provider entitlement.
- Preserve per-watch PostgreSQL scheduling.
- Treat per-watch scheduling as evaluation scheduling, not acquisition scheduling.
- Make provider cadence and market windows server-owned configuration.
- For Tiingo, acquire one canonical 1m series per unique symbol and derive user intervals locally.
- Enforce quotas at the physical HTTP boundary across the whole application.
- Make manual scans evaluation-only.
- Preserve current intrabar evaluation behavior during the optimization.
- Treat Redis snapshots as disposable and PostgreSQL user state as authoritative.
