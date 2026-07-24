# Server-Side Market Scanner and Live Watch Clients

## Status

Draft

## Summary

Move watchlist scheduling, market-data retrieval, candle analysis, and alert deduplication out of the browser and into an independent scanner running on the remote server.

The existing desktop and mobile web interfaces become lightweight clients. They load a server snapshot and receive incremental updates through Server-Sent Events (SSE). Scanning continues when every browser is closed, and all signed-in devices see the same watch state and recent alerts.

This design fixes the architectural source of the current watch-page lag: the page must not schedule hundreds of symbols, fetch candles, analyze patterns, update the entire list, and render the interface on the same JavaScript thread.

## Goals

- Continue scanning on the remote server when no browser is open.
- Keep typing, filtering, scrolling, and chart interaction responsive with 300 or more symbols.
- Show the same watchlist state and alert history on desktop and mobile.
- Deliver live updates to an open browser without polling the entire watchlist.
- Alert at most once for a given symbol, interval, candle, and pattern direction.
- Allow a pattern to alert later if the current candle did not meet the threshold during an earlier scan.
- Respect market-data provider rate limits and session settings.
- Recover safely after scanner, web process, or server restarts.
- Keep provider credentials and user data private.
- Preserve a path to a future Tauri, Rust, or native macOS client using the same server API.

## Non-goals

- Rewriting the current interface in Tauri, Rust, Swift, or another native toolkit.
- Streaming every market tick to every client.
- Replacing provider APIs with an exchange-direct market-data feed.
- Guaranteeing mobile operating-system notifications while the browser is closed in the first release.
- Running a scanner inside a serverless request handler.
- Changing the existing ascending and descending pattern definitions.

## User experience

### Desktop or mobile browser open

1. The user signs in and opens `/watch`.
2. The page loads a current watchlist snapshot from the server.
3. The page opens one authenticated SSE connection.
4. Only changed symbols, new alerts, and scanner-status events are sent to the page.
5. Filtering, pagination, editing, and chart interaction remain local and responsive.
6. If the connection drops, the page displays a reconnecting state and reconnects automatically.

### Browser closed

- The remote scanner continues running.
- Watch status and alerts are persisted in PostgreSQL.
- Reopening `/watch` displays the latest snapshot and recent alerts.
- Ordinary browser notifications do not run merely because the server is scanning. Closed-browser delivery requires Web Push, described separately below.

### Multiple devices

- A desktop and phone signed into the same account see the same server-owned watchlist.
- Changes made on either device are persisted and broadcast to the other.
- Scanner work is not duplicated for each open device.

## Mobile behavior

The watch page works from a mobile browser as long as the remote application is reachable over HTTPS and the user can authenticate.

While the page is open, SSE supplies live status and alerts. When the mobile browser is backgrounded, iOS and Android may suspend the page and its SSE connection. The server continues scanning regardless, and the client catches up from the server when it becomes active again.

Receiving an operating-system notification while the browser is closed is a separate feature:

- Add a service worker and Web Push subscriptions.
- Store one or more push subscriptions per authenticated user and device.
- Send push messages from the server when a new alert is committed.
- On iPhone and iPad, web push requires a supported iOS version, HTTPS, and installation of the site as a Home Screen web app.
- Notification permission must be requested from an explicit user action.
- Clicking a notification opens `/watch?symbol=KORU&alert=<id>` and expands the relevant chart.

Web Push is recommended as a second phase. It must not be confused with SSE: SSE updates an active page; Web Push can notify an inactive or closed installed web app.

## Current state

- `MarketWatcher.tsx` owns browser-side scheduling, sequential scans, market-data requests, pattern detection, alert creation, notification dispatch, and much of the UI state.
- Watchlist data is primarily stored in `localStorage`, with authenticated JSON synchronization through `/api/watch/sync`.
- Recent alert history is browser-local.
- Market-data provider choices and API keys are stored in browser cookies.
- `/api/watch` fetches candles for one requested symbol.
- PostgreSQL and Better Auth are already part of the remote Docker deployment.
- Browser notification delivery depends on the watch page being active enough to execute JavaScript.

## Proposed architecture

```text
Scheduler/reconciler
          │ due jobs
          ▼
┌──────────────────────────────┐
│ Redis + BullMQ              │
│ schedules and retries       │
└──────────────┬───────────────┘
               │ claimed jobs
               ▼
┌──────────────────────────────┐
│ BullMQ scanner workers      │
│ - enforces provider limits  │
│ - fetches candles           │
│ - detects patterns          │
│ - deduplicates alerts       │
└───────┬──────────────┬───────┘
        │ API requests │ result transaction
        ▼              ▼
 Market-data     ┌──────────────────────────────┐
 providers       │ PostgreSQL                  │
                 │ configuration/state/alerts  │
                 │ durable event log           │
                 └──────────────┬───────────────┘
                                │ transactional NOTIFY(event ID)
                                ▼
                 ┌──────────────────────────────┐
                 │ Next.js server             │
                 │ snapshot API + SSE stream  │
                 └──────────────┬───────────────┘
                                │ incremental events
                        ┌───────┴────────┐
                        ▼                ▼
                 Desktop browser    Mobile/PWA
```

### Process boundaries

Run the scanner as a dedicated long-lived worker process, not as a timer created by a Next.js page or route.

The production Compose deployment should contain:

```text
web       Next.js pages, authenticated APIs, and SSE
scanner   One or more BullMQ scanner workers
postgres  Durable configuration, state, and alerts
redis     BullMQ jobs, scheduling, retries, and rate limits
```

Separating `web` and `scanner` prevents a web-process restart from silently creating duplicate loops. It also allows the UI and scanner to be restarted or scaled independently. BullMQ coordinates competing workers, so additional scanner containers can increase capacity without assigning the same queue delivery intentionally to every worker.

BullMQ delivery is treated as at least once: a job may be redelivered after a worker crash or lost acknowledgement. Every scan handler must therefore be idempotent, and PostgreSQL uniqueness constraints remain the final protection against duplicate alerts.

### Selected open-source components

- **Redis:** BullMQ queue storage, short-lived cache, and rate-limit counters.
- **BullMQ:** derived one-shot and delayed jobs, worker concurrency, retries, exponential backoff, and stalled-job recovery.
- **Bull Board:** administrator-only BullMQ queue and job dashboard.
- **PostgreSQL:** authoritative user, watch, scan-state, event-cursor, credential, and alert storage, plus transactional `LISTEN/NOTIFY` signals.
- **SSE:** authenticated server-to-browser incremental updates.

RabbitMQ is not part of the initial architecture. It remains a valid future alternative if the system develops complex AMQP routing or many independently implemented services in different languages. Redis familiarity, the existing TypeScript stack, and BullMQ's job features make Redis + BullMQ the selected design.

## Server-owned data model

The existing watchlist JSON is suitable for migration input but not for scheduling and querying at scale. Normalize active watches into rows.

### Watch

```ts
interface ServerWatch {
  id: string;
  userId: string;
  symbol: string;
  assetClass: 'equity' | 'futures' | 'crypto';
  interval: string;
  minMovePercent: number;
  session: 'rth' | 'pre' | 'ext' | 'all';
  enabled: boolean;
  providerCredentialId?: string;
  scanFrequencySeconds: number;
  nextScanAt: string;
  createdAt: string;
  updatedAt: string;
}
```

Add a unique constraint covering the user-visible identity of a watch, initially `(user_id, symbol, interval)`.

### Watch state

```ts
interface CandleSnapshot {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface ServerWatchState {
  watchId: string;
  status: 'idle' | 'normal' | 'bullish' | 'bearish' | 'no-data' | 'error';
  lastPrice?: number;
  lastCandleTime?: string;
  lastScannedAt?: string;
  lastProvider?: string;
  lastError?: string;
  recentCandles: CandleSnapshot[];
  updatedAt: string;
}
```

Persist at most 60 ascending, session-filtered candles per watch state. Reject non-finite OHLCV values before persistence. This bounded window supports compact previews and immediate chart expansion without making every snapshot unbounded. Larger chart requests continue to use the chart API or a bounded server cache.

### Alert

```ts
interface ServerWatchAlert {
  id: string;
  userId: string;
  watchId: string;
  symbol: string;
  interval: string;
  direction: 'bullish' | 'bearish';
  candleTime: string;
  price: number;
  changePercent: number;
  message: string;
  patternVersion: number;
  createdAt: string;
}
```

Enforce deduplication in PostgreSQL, not only in memory. A unique constraint must cover `(watch_id, candle_time, direction, pattern_version)`. This guarantees:

- Repeated scans of an already-alerted 10-minute candle do not create another alert.
- A candle that did not qualify earlier may alert on a later scan after crossing the threshold.
- A worker restart does not forget which candle already alerted.

An evaluation that does not currently qualify writes watch state only. It must not create an alert row, reservation row, deduplication placeholder, or equivalent marker for that candle and direction. The first qualifying evaluation inserts the alert row; later qualifying evaluations conflict safely with the unique constraint.

Retain alerts for a configurable server-side period. The watch UI may show only the last 10 minutes and at most 50 entries, while the server may retain a longer operational history for catch-up and troubleshooting.

### Provider credentials

The remote worker cannot use API keys stored only in browser cookies. Provider configuration must move server-side before server scanning becomes authoritative.

Support either:

1. A server-wide provider credential supplied through environment variables.
2. Per-user credentials stored encrypted in PostgreSQL.

Per-user secrets must be encrypted before storage using a server-held key ring. Every encrypted record stores its `keyVersion`, encryption algorithm, nonce/IV, authentication tag where applicable, and ciphertext. New writes use the active key version; reads may use retained older keys. Rotation re-encrypts records incrementally without requiring a flag-day migration, and old keys are removed only after no records reference them.

API responses must return only provider name, credential status, key-rotation status, and a masked identifier—never the secret. Secrets must not appear in logs, SSE events, watchlist JSON, or client storage after migration.

## Scheduling and provider limits

PostgreSQL is the single source of scheduling truth. Each watch's `scanFrequencySeconds`, `nextScanAt`, session, and enabled state define its authoritative cadence. BullMQ stores only derived, one-shot execution jobs; it does not own a repeating schedule for each watch.

A scheduler selects due PostgreSQL watches, evaluates session eligibility, groups eligible work, and enqueues deterministic BullMQ jobs. After a successful scan or deliberate session deferral, it advances `nextScanAt` from the canonical frequency and market calendar. Reconciliation recreates missing BullMQ work from PostgreSQL after Redis loss or process restart. If PostgreSQL and BullMQ disagree, PostgreSQL wins.

Out-of-session watches are normally filtered before enqueueing. Their `nextScanAt` is advanced to the next eligible session time without making a provider request. Because a session may close or configuration may change after enqueueing, the worker revalidates every included watch immediately before fetching. It excludes ineligible watches, advances them to their next eligible time, and completes the current job as a recorded no-op if none remain. No due watch may be silently dropped.

Requirements:

- Use `America/New_York` for equity session calculations, including daylight-saving transitions.
- Treat futures and crypto with their own session rules.
- Apply a Redis-backed rate limiter per provider credential and provider plan.
- Add small scheduling jitter to avoid request bursts at exact interval boundaries.
- Bound BullMQ worker concurrency so slow providers cannot exhaust memory or sockets.
- Use request timeouts and BullMQ exponential backoff for transient failures.
- Limit retry attempts and retain terminal failures for administrator inspection.
- Do not allow one failing symbol to stop the worker.
- Set deterministic job identifiers where supported and keep handlers idempotent.
- Keep queue payloads small: use watch, batch, or fetch identifiers rather than embedding credentials or large candle arrays.

Optimization groups currently eligible watches by provider credential, provider, symbol, and interval. One fetched candle response can be analyzed against multiple watches and thresholds when authorization and subscription terms allow it. This becomes important as the number of users grows.

The scheduler should prefer shared fetch jobs keyed by provider credential, provider, symbol, interval, and scheduled candle window, followed by analysis for every included watch. Opening more browsers must never enqueue additional provider scans.

Session eligibility is evaluated per watch before grouping and revalidated by the worker. After the shared provider response arrives, candle session filtering and minimum-move evaluation are performed separately for each watch. A single watch's session or threshold must never gate, alter, or starve the fetch or analysis required by another watch in the same group.

BullMQ's open-source features are sufficient initially. If plan-specific or tenant-specific concurrency cannot be expressed cleanly, implement a Redis token bucket keyed by provider credential rather than making the product dependent on BullMQ Pro.

## Pattern evaluation

Extract the existing pattern detector into a shared, environment-independent module with no React, browser storage, audio, or notification dependencies. Both tests and the worker use this module.

Pattern evaluation must be deterministic for:

- Candle input.
- Interval.
- Minimum move threshold.
- Session-filtered candle set.
- Pattern algorithm version.

Store a `patternVersion` with every alert so future detector changes do not make historical deduplication ambiguous.

## API design

All endpoints require a valid Better Auth session and derive `userId` from that session.

### Snapshot

`GET /api/watch/state`

Returns:

- Normalized watches.
- Current state for each watch.
- Recent alerts.
- Scanner health and last heartbeat.
- A monotonic snapshot/event cursor.

The initial page load uses one snapshot instead of issuing a fetch for every visible symbol.

### Live stream

`GET /api/watch/events`

Use SSE with:

- `Content-Type: text/event-stream`
- Disabled proxy buffering.
- No response caching or compression buffering.
- A heartbeat comment approximately every 15–25 seconds.
- Authentication before opening every stream.
- Periodic session revalidation while the stream is connected.
- A configurable maximum stream lifetime, initially 20 minutes, followed by a normal reconnect and fresh authentication.
- Immediate stream closure when periodic revalidation finds an expired, revoked, or invalid session.
- Cleanup when the client disconnects.
- A reconnect delay.
- Catch-up using `Last-Event-ID` or a cursor query parameter.

Initial event types:

```text
watch.updated
watch.removed
watch.state
alert.created
scanner.status
```

Every event includes only the authenticated user's data. Do not publish a global stream and filter it in the browser.

SSE is preferred initially because updates are predominantly server-to-client, browser reconnection is built in, and the protocol works through ordinary HTTPS infrastructure. Watchlist edits continue through authenticated HTTP requests. WebSockets may be introduced later only if continuous bidirectional messaging becomes necessary.

### Watch mutations

```text
POST   /api/watch/items
PATCH  /api/watch/items/:id
DELETE /api/watch/items/:id
```

Mutations persist first, then notify connected clients. Optimistic UI is allowed, but the server response remains authoritative.

### Alert acknowledgement

Do not delete a shared alert merely because one device displayed it. If read state is needed, store per-user or per-device acknowledgement separately.

## Queue and event transport

### Scan jobs

BullMQ is the authoritative delivery mechanism for scan work. Producers enqueue small, versioned job payloads. Scanner workers acknowledge jobs only after the result transaction has committed or the outcome is known to be safely retryable.

Recommended queues:

```text
market-scan       Due provider fetch and analysis jobs
market-scan-low   Controlled retries and non-urgent catch-up
web-push          Closed-browser notification delivery
maintenance       Retention, reconciliation, and cleanup
```

Failed jobs use bounded attempts and exponential backoff. Exhausted jobs remain visible for a retention period and are surfaced through Bull Board rather than retried forever.

### Result events

PostgreSQL remains the durable source of truth. In the same transaction, the scanner writes watch state, any qualifying alert, a monotonic event record, and `NOTIFY`s a channel with the event identifier. PostgreSQL delivers the notification after commit, so web processes never observe a signal for rolled-back state.

The `NOTIFY` payload contains only a compact event identifier, never the full event, user data, candles, or credentials. This keeps the payload far below PostgreSQL's notification limit. Every Next.js web process maintains a dedicated `LISTEN` connection, loads the durable event by identifier, authorizes it, and emits it to matching local SSE clients.

`LISTEN/NOTIFY` is a wakeup mechanism rather than durable delivery. A disconnected web process may miss a notification, but the event remains in PostgreSQL. On startup and reconnection, web processes and clients recover events after their last durable cursor. Duplicate notification or catch-up delivery is safe because event identifiers are stable and clients apply them idempotently.

## Client refactor

The watch page should become a presentation and command layer:

- Load one server snapshot.
- Maintain one SSE connection.
- Apply incremental events to a keyed client store.
- Render only the current filtered or paginated rows.
- Send add, edit, pause, and delete commands to the server.
- Request detailed chart candles only when a chart is expanded.
- Play in-page sound only when a new live alert event arrives and sound is enabled.
- Use Web Push, not page JavaScript, for reliable closed-page notifications.

Remove from the browser:

- Round-robin timers.
- Per-symbol automatic market-data fetches.
- Authoritative pattern detection.
- Authoritative alert deduplication.
- Provider API secrets.
- Browser-local alert history as the source of truth.

Local storage may retain non-sensitive display preferences such as compact/table view, filters, and sound preference.

## Deployment requirements

- The remote app must be served over HTTPS.
- The production reverse proxy must negotiate HTTP/2 or newer with browser clients so an SSE stream does not consume one of the small number of HTTP/1.1 per-origin connections.
- The reverse proxy must support long-lived SSE responses and disable buffering for the events route.
- `web`, `scanner`, and `redis` must restart automatically.
- Redis persistence must be enabled for BullMQ data.
- Redis must use a non-evicting policy for queue keys; disposable cache data should use a separate instance or carefully isolated memory budget.
- Redis must not be exposed publicly and must require authenticated, encrypted remote connections when it spans hosts.
- The scanner must expose a heartbeat visible to the UI and operational health checks.
- Database migrations must run before the new worker starts.
- The server clock must be synchronized; stored timestamps use UTC.
- Graceful shutdown must stop claiming new scans and allow in-flight database writes to finish.
- Provider and push secrets are injected through server environment variables or encrypted storage.

The current remote Docker server can host this architecture by adding `redis` and `scanner` services to `docker-compose.yml`. A serverless platform with request time limits is not sufficient for the long-lived worker unless externally hosted workers are also used.

## Reliability and recovery

- PostgreSQL, not BullMQ or process memory, determines durable schedules; BullMQ determines current execution-job state.
- On startup, a reconciliation process restores missing execution jobs from due PostgreSQL watches.
- BullMQ recovers stalled work and retries transient failures with bounded backoff.
- Every worker handler tolerates at-least-once delivery.
- Redis persistence reduces queue loss but is not the final correctness mechanism. Idempotent workers and PostgreSQL uniqueness constraints make replay safe; PostgreSQL-to-BullMQ reconciliation restores execution work that Redis may lose before persistence.
- AOF `everysec` is acceptable initially with this replay-and-reconciliation model. Stronger Redis durability may be selected from measured recovery objectives.
- A stale scanner heartbeat produces a visible degraded/offline state.
- SSE reconnects do not trigger duplicate alerts.
- A client returning after suspension reloads a snapshot or requests events after its last cursor.
- Provider outages do not erase the last known valid state.
- No-data responses are distinct from provider and network errors.

## Security and privacy

- Require authentication for snapshots, streams, mutations, credentials, and push subscriptions.
- Derive ownership from the server session; never trust a client-supplied `userId`.
- Authorize every watch and alert read or mutation.
- Encrypt per-user market-data credentials at rest.
- Do not include credentials in browser cookies after migration.
- Redact secrets and provider response bodies from production logs.
- Validate symbols, intervals, thresholds, and session values at API boundaries.
- Apply mutation and connection rate limits.
- Restrict SSE responses to the authenticated user.
- Use CSRF protections appropriate to cookie-authenticated mutations.
- Allow users to revoke individual push subscriptions/devices.

## Observability

Track:

- Scanner heartbeat and loop delay.
- BullMQ waiting, delayed, active, completed, failed, retried, and stalled counts.
- Oldest waiting job and queue processing latency.
- Per-provider request rate, latency, rate-limit responses, and errors.
- Alert count and database deduplication conflicts.
- PostgreSQL event-listener health, notification lag, and cursor catch-up count.
- Redis memory, persistence, connection, and eviction metrics.
- SSE connection count, reconnects, event lag, and slow clients.
- Oldest overdue watch.

Logs should include watch IDs and provider names where useful, but never API keys or full authorization headers.

### Bull Board

Mount the open-source Bull Board interface at `/admin/queues`.

Requirements:

- Restrict access to authenticated administrators.
- Prefer read-only mode for ordinary operational access.
- Limit retry, removal, cleaning, pause, and resume actions to privileged administrators.
- Hide Redis connection details.
- Treat job payloads and errors as private operational data.

Bull Board is for job inspection and intervention. It does not replace product monitoring, durable audit records, or time-series metrics.

## Testing

### Unit tests

- Pattern evaluation at, below, and above the threshold.
- Same-candle deduplication.
- A candle that qualifies only on a later scan.
- New-candle alert behavior.
- Eastern Time session boundaries and daylight-saving changes.
- Scheduler backoff and provider-rate calculations.
- PostgreSQL cadence produces the expected deterministic one-shot jobs.
- Out-of-session due watches advance to the next eligible session without a provider request.
- Shared fetch analysis respects different per-watch sessions and thresholds.
- Deterministic job identity and idempotent redelivery.
- Nonqualifying evaluations create no alert or deduplication placeholder.
- Credential encryption and incremental key rotation across key versions.
- Candle snapshot validation, ordering, and the 60-candle limit.

### Integration tests

- BullMQ worker commits state, an event record, and a transactional PostgreSQL notification.
- Failed jobs retry with bounded backoff and become inspectable after exhaustion.
- A worker crash causes safe redelivery without a duplicate alert.
- SSE returns only the signed-in user's events.
- SSE periodically revalidates its session and closes after expiry, revocation, or maximum lifetime.
- Reconnection catches up without duplicate alerts.
- A web process that misses `NOTIFY` catches up from the durable PostgreSQL event cursor.
- Watch mutation is reflected on a second connected client.
- Worker restart preserves deduplication and scheduling.
- Redis execution-job loss is rebuilt from PostgreSQL without changing canonical cadence.
- A job delivered after its session closes completes as a recorded no-op and preserves its next eligible run.
- Provider credentials never appear in API or SSE payloads.

### Load tests

- One user with at least 300 watches.
- Multiple connected devices for the same user.
- Slow and rate-limited provider responses.
- SSE client suspension and reconnection.
- Scanner restart with a large overdue queue.
- Multiple BullMQ workers processing the same queues.
- Redis restart and execution-job reconciliation.

### Mobile verification

- Responsive watch page on current Safari iOS and Chrome Android.
- Resume after background suspension.
- Add-to-Home-Screen and Web Push permission flow where supported.
- Notification click opens the correct symbol and alert.

## Acceptance criteria

- Scanning continues for at least 30 minutes with all browser windows closed.
- Reopening `/watch` shows current server state and recent alerts.
- A desktop and phone signed into the same account receive the same watch updates.
- An open watch page receives incremental events without polling every symbol.
- Typing and scrolling remain responsive while 300 or more symbols are actively monitored.
- The browser performs no automatic round-robin market-data scan.
- The same pattern direction alerts no more than once for one candle.
- A previously unqualified in-progress candle alerts after it first crosses the configured threshold.
- Restarting the scanner does not duplicate an existing alert.
- Adding scanner workers increases capacity without multiplying scans per connected browser.
- Bull Board is available only to authenticated administrators.
- Redis interruption produces a visible degraded state and recovers without losing PostgreSQL alert history.
- Missing Redis execution jobs are restored from PostgreSQL reconciliation.
- PostgreSQL remains authoritative when BullMQ job state disagrees with a watch schedule.
- Out-of-session jobs make no provider request and retain their next eligible scan.
- Watches sharing one fetch are filtered and evaluated with their own sessions and thresholds.
- Expired or revoked sessions cannot retain an SSE stream beyond its revalidation window.
- Production browser connections use HTTP/2 or newer.
- Provider credentials can rotate encryption keys without downtime or plaintext exposure.
- Scanner health and disconnection states are visible.
- Provider credentials are not exposed to the browser or logs.
- The production worker and web processes restart independently.

## Suggested implementation sequence

1. Add normalized watch, watch-state, alert, scanner-heartbeat, and event-cursor tables.
2. Extract and unit-test the pattern detector as a server-safe shared module.
3. Add encrypted server-side provider configuration and migrate away from credential cookies.
4. Add Redis and BullMQ configuration with persistence, health checks, and non-evicting queue storage.
5. Implement PostgreSQL-authoritative scheduling, deterministic one-shot BullMQ jobs, reconciliation, rate limiting, and database deduplication.
6. Add the durable event log, transactional PostgreSQL `NOTIFY`, snapshot API, and bounded authenticated SSE stream.
7. Add an administrator-only Bull Board interface at `/admin/queues`.
8. Convert the watch page to snapshot plus incremental events and remove browser scanning.
9. Migrate authenticated watchlist JSON into normalized rows while keeping a short rollback window.
10. Add scanner services and HTTP/2 reverse-proxy SSE configuration to production deployment.
11. Load-test 300 or more symbols, multiple workers, and desktop/mobile synchronization.
12. Add service worker, push subscriptions, and a BullMQ Web Push worker for closed-browser notifications.

## Rollout and rollback

Use a feature flag with these stages:

1. **Shadow:** server worker scans a test watchlist but does not notify users.
2. **Compare:** selected users see server results alongside browser results; record discrepancies.
3. **Server authoritative:** server creates alerts while browser scanning is disabled for selected users.
4. **General release:** all authenticated users use the server scanner.
5. **Cleanup:** remove legacy browser-scanning and credential-cookie code after the rollback window.

During comparison, ensure only one path is allowed to send user-visible notifications. Rolling back re-enables browser scanning but does not discard normalized server data.

During Compare, prefer running the legacy browser detector and the server detector against the same server-fetched candle payload. This validates session filtering and pattern parity without doubling provider usage. Use sampled independent browser-versus-server provider requests only when validating the fetch path itself. Any full duplicate scanning must use a separate credential or explicitly reserved rate-limit capacity, and rate-limit failures must be classified separately from result mismatches.

## Open product decisions

- Whether provider credentials are server-wide, per user, or both.
- How long server alert history should be retained beyond the 10-minute UI window.
- Whether scanning is available only to authenticated users.
- Whether inactive accounts continue consuming provider capacity indefinitely.
- Whether alert thresholds and scan frequency require subscription tiers.
- Whether the first push-notification release targets installed mobile PWAs, desktop browsers, or both.
- Whether future Tauri and native clients connect directly to this same remote service.
- Whether Redis queue and disposable cache workloads use separate instances at launch or only after measured contention.
