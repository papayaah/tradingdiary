# Admin Observability Dashboard

## Status

Proposed.

## Related specifications

- [Shared Market-Data Scanning Across Users](./shared-market-data-scanning.md) — produces the governor, cache, and provider-usage signals this dashboard surfaces (its "Observability" section lists counters that are computed but not yet displayed).
- [Server-Side Market Scanner and Live Watch Clients](./server-side-market-scanner.md) — owns the scanner, watches, alerts, heartbeat, and SSE this dashboard reports on.
- [Scanner Configuration: Server as the Source of Truth](./scanner-config-server-authority.md) — the provider-config work that would make per-user provider scopes meaningful in these metrics.

## Summary

The app already produces rich operational signal — provider request counts, scanner heartbeats, BullMQ queue depth, the adaptive governor's per-scope cadence, and shared-cache activity — but there is **no way to see it**. Some of it is only written to logs (governor decisions, cache hits/misses); some sits in tables (`provider_request_stats`, `scanner_heartbeat`) exposed by one-off admin JSON endpoints with no UI.

This spec defines a **read-only admin dashboard** that answers, at a glance:

- Who is using the app (users, activation, engagement)?
- What is being watched (unique symbols, intervals, asset classes, overlap)?
- Is the scanner healthy (workers, queue, Redis, shadow mode)?
- What is it costing (provider requests vs. caps, projected daily/monthly)?
- Is the shared architecture *working* (cache hit rate, sharing ratio, governor cadence)?
- What is it producing (alerts, pushes, events)?

The headline metric the whole shared-scanning effort exists to move — **the sharing ratio (evaluations ÷ upstream requests)** and its cousin **watches ÷ unique symbols** — becomes directly visible here, so the value of the cache/governor is legible rather than inferred.

## Goals

- Surface app-wide health and usage in one admin-only view, refreshed automatically.
- Make the shared-scanning invariant ("requests scale with unique symbols, not users") measurable and obvious.
- Reuse existing data and endpoints where possible; add persistence only for signals currently trapped in scanner logs/memory.
- Follow `docs/design-system.md`: semantic theme tokens, legible in light and dark, embedded panels over modals, a dedicated route.
- Keep it strictly observational first; control actions (pause scanner, flip flags) are a later, separate concern.

## Non-goals

- Exposing one user's private watchlist, thresholds, or alerts to another user. The dashboard shows **aggregates and top-N**, not personal watch contents, and minimizes PII (see Privacy).
- Replacing a real metrics/APM stack (Grafana/Prometheus). This is a lightweight, app-native operator view, not long-horizon time-series storage.
- Real-time per-tick streaming. Polling at a coarse interval (with optional SSE later) is sufficient.
- Write/control operations in the first phases (no scanner pause, no flag toggling, no watch edits).

## What to monitor — metrics catalog

Grouped by panel. "Source" is where the number comes from today; **new** marks signal that must be emitted/persisted before it can be shown (see Architecture).

### 1. Overview (KPI tiles)

| Metric | Source | Why it matters |
|---|---|---|
| Total users | `user` table | Baseline scale |
| Active users (24h / 7d) | `session` table (last activity) | Real engagement, not just signups |
| Activated users (≥1 enabled watch) | `server_watch` grouped by user | Funnel: signed up → actually using |
| Total watches (enabled / disabled) | `server_watch` | Raw workload |
| **Unique symbols** | distinct `symbol` in enabled `server_watch` | The number provider load *should* scale with |
| **Unique acquisition keys** (symbol × interval × scope) | scanner inventory (**new**, or derived) | What the governor throttles on (`N`) |
| **Sharing ratio** (watches ÷ unique symbols) | derived | How much the cache saves; 1.0 = no overlap yet |
| Upstream requests today | `provider_request_stats` | Actual cost |
| Alerts today | `server_watch_alert` | Output/value delivered |
| Scanner status (up / stale / shadow) | `scanner_heartbeat` + config | Is it even running, and will it notify? |

### 2. Users & engagement

| Metric | Source |
|---|---|
| Signups over time (daily, 30d) | `user.createdAt` |
| Active users trend (DAU/WAU) | `session` |
| Users with push subscriptions | push-subscription table |
| Distribution of watches per user (histogram) | `server_watch` grouped by user |

### 3. Watchlists & symbols

| Metric | Source | Why |
|---|---|---|
| Unique symbols by asset class (equity/futures/crypto) | `server_watch` | Where load concentrates |
| Interval distribution (1m/10m/…) | `server_watch` | Feeds aggregation value estimate |
| **Top watched symbols** (by distinct users) | `server_watch` | Which symbols benefit most from sharing |
| Overlap multiplier per symbol (watchers ÷ 1) | `server_watch` | Direct cache-savings evidence |
| Enabled vs. disabled, in-session vs. out | `server_watch` + session calc | What actually drives fetches now |

### 4. Scanner health

| Metric | Source | Why |
|---|---|---|
| Worker heartbeats (id, last beat, staleness) | `scanner_heartbeat` (existing `/api/admin/queues`) | Worker liveness |
| Queue depth (active/waiting/delayed/failed/completed) | BullMQ (existing `/api/admin/queues`) | Backlog monitoring |
| **Redis memory used** (`used_memory_human`) | Redis `INFO memory` (**new**) | RAM footprint of cache, snapshots & metrics |
| **Redis memory utilization %** (`used_memory / maxmemory`) | Redis `INFO memory` (**new**) | Early warning gauge before Redis eviction or OOM |
| Redis connectivity | existing `/api/admin/queues` | Basic connection health |
| Shadow mode on/off | scanner config (**new** surfacing) | Is scanner actively notifying? |
| Scans/min, failed jobs & error summaries | BullMQ metrics / **new** counter | Performance & top failure reasons |
| Aggregation & governor enabled flags | scanner config (**new** surfacing) | Current operational feature flags |

### 5. Provider usage & cost

| Metric | Source | Why |
|---|---|---|
| Requests today by provider + key_owner (owner/user) | `provider_request_stats` (existing `/api/admin/provider-stats`) | The bill |
| **Upstream errors & status code breakdown** (429 rate limit, 5xx, timeout) | `provider_request_stats` / **new** error counter | Identifies provider outages & rate cap hits |
| Requests trend (30/90d) | `provider_request_stats` | Growth |
| Projected daily vs. configured cap (per scope) | derived from governor budget | Are we near the ceiling? |
| Headroom utilization (%) | derived | How much margin is left |
| Requests/hour, current | `provider_request_stats` (hourly) **new granularity** or derived | Live rate to compare against the provider dashboard |

### 6. Governor (adaptive cadence)

| Metric | Source | Why |
|---|---|---|
| Per scope: `N`, effective cadence (s), binding term (floor/ask/hourly/daily/bandwidth) | scanner governor (**new persistence**) | Explains *why* cadence is what it is |
| Predicted requests/hr (`N × 3600 ÷ cadence`) | derived | The number to reconcile with the provider dashboard |
| Cadence history (when/why it changed) | **new** | Did a symbol surge slow everyone down? |
| Headroom utilization per scope | derived | The throttle made legible |

### 7. Shared-cache efficiency

| Metric | Source | Why |
|---|---|---|
| Cache hits / misses / **hit rate** | SharedCandleService (**new** counters) | Is sharing actually happening? |
| Single-flight waiters served per owner fetch | **new** | Cross-process collapse effectiveness |
| **Sharing ratio** (evaluations ÷ upstream requests) | **new** + `provider_request_stats` | The headline invariant |
| Negative-cache events, provider errors | **new** | Failure fan-out contained? |
| Snapshots in Redis, average snapshot age | Redis scan of `market-data:snapshot:*` | Cache footprint & freshness |
| Aggregation coverage (derived vs. native), when on | **new** | Phase 4 payoff |
| **Live cached symbols** (symbol, interval, provider, age) | snapshot *values* (key is a hash; value carries `canonicalSymbol`/`interval`/`fetchedAt`) | See exactly what is cached and how fresh, in real time |
| **In-flight fetches now** (symbol/scope being fetched) | held locks `market-data:lock:*` + BullMQ `active` jobs | See what is hitting the provider this instant |

### 8b. Live connections & delivery (real-time presence)

The evaluation result of every scan is broadcast to connected browsers over SSE (`/api/watch/events`), separate from the Redis candle cache: **candles are cached for sharing; the per-user state/alert is pushed right away** via `watch_event` → `pg_notify` → the events-bridge fan-out. This panel makes that live delivery visible.

| Metric | Source | Why |
|---|---|---|
| **Active SSE connections (listeners) now** | `events-bridge` subscriber count (**new**, Redis-backed so it aggregates across web instances) | How many browsers are watching live right now |
| Listeners by user | same, keyed by user | Presence / concurrent usage |
| Events broadcast/min (state vs. alert) | `watch_event` insert rate (**new** counter or table rate) | Live delivery volume |
| Broadcast lag (event insert → SSE flush) | optional timing (**new**) | Is "right away" actually right away? |

### 8. Alerts & delivery

| Metric | Source | Why |
|---|---|---|
| Alerts created today / 7d, by pattern & direction | `server_watch_alert` | Value delivered to users |
| Push notifications sent / failed | push send path (**new** counter) | Outbound push throughput |
| **Push notification error breakdown** (expired VAPID / `410`, payload error, network timeout) | push send path (**new**) | Diagnoses failing push subscriptions |
| Watch events emitted (SSE volume) | `watch_event` | In-app delivery volume |
| Alert-to-fetch efficiency (alerts ÷ upstream requests) | derived | Yield per request |

## Architecture & data sources

The dashboard is a Next.js admin route reading from three places. The one real design problem is that **the scanner is a separate process**: its governor cadence, `N`, and cache hit/miss counters live in scanner memory and are only logged today. The web app can read Postgres and Redis but not scanner memory — so those signals must be **emitted to a shared store**.

```text
┌── Next.js web (admin route) ──┐        reads
│  /admin  +  /api/admin/*      │──────────────────────────┐
└───────────────────────────────┘                          │
        reads │                    reads │                 │
        ▼                                ▼                 ▼
   PostgreSQL                        Redis            (existing APIs)
   users, sessions,                 market-data:*     /api/admin/queues
   server_watch(_state/_alert),     snapshots/locks   /api/admin/provider-stats
   watch_event, scanner_heartbeat,  + NEW counters:
   provider_request_stats           metrics:cache:*  (hits/misses/waiters)
                                     metrics:governor:<scope> (N, cadence, term)
        ▲                                ▲
        │ writes (already)               │ writes (NEW, cheap)
   ┌────┴──────────────── Scanner process ─────────────────┐
   │  worker + scheduler + SharedCandleService + governor  │
   └───────────────────────────────────────────────────────┘
```

### Emission plan (the only new scanner work)

- **Cache counters & TTL lifecycle:** `SharedCandleService` increments Redis counters (`INCR metrics:cache:{YYYYMMDDHH}:{hits,misses,waiters,upstream,errors}`). All metrics keys **must set an explicit TTL** (e.g. `EXPIRE 7 days`) on creation so old keys expire cleanly. Cheap, fire-and-forget, never blocks a fetch.
- **Governor state:** on each recompute, the scanner writes a small record per scope (`metrics:governor:<scope>` hash: `N`, `cadenceSeconds`, `bindingTerm`, `headroomUtilization`, `updatedAt`) to Redis, and optionally appends to a `scanner_governor_log` table for history.
- **Config surfacing:** the scanner writes its effective flags (`shadow`, `aggregationEnabled`, `governorEnabled`, budgets) into its heartbeat `detail` payload (already a JSON column) so the admin API can show them without env access.
- Everything else (users, watches, alerts, provider stats, heartbeats, queue) is **already persisted** — Phase 1 needs no scanner changes.

### API surface

Extend the existing admin API namespace, all gated by `isAdminEmail`:

- `GET /api/admin/overview` — the KPI tiles (users, watches, unique symbols, sharing ratio, alerts today, scanner status).
- `GET /api/admin/users?days=30` — engagement series.
- `GET /api/admin/watches` — symbol/interval/asset-class aggregates, top-N symbols.
- `GET /api/admin/provider-stats` — **exists**; extend with status code error breakdowns & projections vs. caps.
- `GET /api/admin/queues` — **exists**; extend with Redis memory stats (`used_memory_human`, utilization %), config flags + scans/min.
- `GET /api/admin/governor` — per-scope `N`, cadence, binding term, predicted req/hr.
- `GET /api/admin/cache` — hit rate, waiters, sharing ratio, snapshot count/age.

## UI

- New admin route group, e.g. `app/(admin)/admin/page.tsx`, linked only for admins. Server-guarded by `isAdminEmail` (redirect non-admins).

### Navigation & discoverability

The admin dashboard needs an entry point in the existing `components/sidebar/Sidebar.tsx`, shown **only to admins**. There is a wrinkle: the sidebar is a client component that knows the user via `authClient.useSession()` (which exposes `user.email`), but `isAdminEmail` reads **server-side** env vars (`ADMIN_EMAILS`/`ADMIN_EMAIL`) the browser cannot see. So the client cannot decide admin-ness on its own. Options, in order of preference:

1. **Expose an `isAdmin` flag on the session** (better-auth `customSession`/additional-fields), so `authClient.useSession()` returns it and the sidebar conditionally renders an "Admin" nav item. Cleanest — one source of truth, no extra fetch.
2. **A tiny `GET /api/admin/status`** returning `{ isAdmin }` (server-evaluated via `isAdminEmail`), which the sidebar fetches once and caches. Simple, no auth-config change.

Either way:

- The nav item (an "Admin" link with a distinct icon, e.g. a gauge/shield) appears in the sidebar **only when `isAdmin` is true**; non-admins never see it.
- Hiding the link is **not** the security boundary — the `/admin` route and every `/api/admin/*` endpoint remain server-guarded by `isAdminEmail` regardless (defense in depth). Hiding is purely UX.
- Place it visually separated from the user's normal journal/watch nav (e.g. a lower "Admin" group or a divider) so it reads as an operator tool, not a normal feature.
- **Design-system compliant:** semantic tokens (`background`, `card-bg`, `card-border`, `muted`, `accent`, `profit`, `loss`) — no raw palette values; legible in light and dark; **no modals** — use cards, expandable sections, and a page-level layout.
- Layout: a top **Overview** row of KPI tiles, then collapsible sections per panel group above. `recharts` (already a dependency) for trend lines and small bar charts; plain tables for top-N and worker lists.
- **Auto-refresh & Page Visibility:** poll each panel's endpoint on a coarse interval (e.g. 15–30s) with a visible "updated Xs ago" indicator and a manual refresh button. Polling **must pause when `document.hidden` is true** (Page Visibility API) to save Redis/DB load when tabs are inactive.
- **Export Diagnostic JSON:** include a header action to download a single diagnostic JSON dump (overview, Redis memory, worker status, error counts) for troubleshooting.
- Empty/degraded states: if Redis is down, cache/governor panels show "unavailable" rather than erroring the page (mirrors how `/api/admin/queues` already degrades).

## Access control & privacy

- Gate every admin route and endpoint with `isAdminEmail`.
- **Security Rule (Fail-Closed in Production):** While dev environment may allow access when no allowlist is configured, `isAdminEmail` **must fail-closed (return `false`) in `production` (`NODE_ENV === 'production'`)** if `ADMIN_EMAILS`/`ADMIN_EMAIL` is missing. Flag this prominently with an amber alert card in dev UI when the allowlist is empty.
- Show aggregates and top-N only; never render another user's watchlist, thresholds, or alert contents. Where a symbol's watcher count is shown, show the count, not who.
- Redis keys and logs already avoid credentials (per the scanning spec); the dashboard must never surface API keys, tokens, or raw provider URLs.

## Phased delivery

### Phase 1 — Overview from existing data (no scanner changes)
Users, activation, watches, unique symbols, sharing ratio (watches ÷ unique symbols), provider requests (existing endpoint), scanner heartbeat + queue (existing endpoint), alerts today. Ships the whole "who/what/is-it-alive/what's-it-costing" picture immediately.

### Phase 2 — Governor & cache emission
Add the Redis counter emission in `SharedCandleService` and the per-scope governor record; add the Governor and Cache Efficiency panels (hit rate, `N`, cadence, binding term, predicted req/hr). This is where the shared-scanning payoff becomes visible.

### Phase 3 — Trends & alert analytics
Historical series (signups, requests, cadence changes), alert breakdowns by pattern/direction, push delivery success, projections vs. caps with headroom gauges.

### Phase 4 — Optional live & controls
SSE-driven live tiles; and, only if wanted, guarded control actions (toggle shadow, pause a scope, adjust a budget) — explicitly out of scope until the read-only view has proven useful.

## Acceptance criteria

- An admin can open one page and, without reading logs, see: total/active users, unique symbols, sharing ratio, scanner up/shadow status, requests-today vs. cap, and alerts-today.
- The governor panel shows, per provider scope, `N`, the effective cadence, the binding constraint, and a predicted requests/hour that reconciles with the provider's own dashboard within normal variance.
- Cache hit rate and sharing ratio are visible and update as watches are added/removed.
- Non-admins cannot reach the page or any `/api/admin/*` endpoint; with no allowlist configured, the UI warns that admin access is open.
- Redis or scanner downtime degrades individual panels, never white-screens the dashboard.

## Open questions

- **Hourly granularity:** `provider_request_stats` is daily. A live "requests this hour" tile needs either hourly buckets or deriving rate from the governor's predicted `N × 3600 ÷ cadence`. Start with the derived prediction; add hourly buckets only if the reconciliation gap is too wide.
- **History retention:** governor/cadence history and cache counters — keep in Redis (ephemeral, cheap) or a Postgres table (durable, queryable)? Propose Redis for live values + a thin Postgres append log only for cadence changes.
- **Multi-worker:** counters must aggregate across scanner instances (INCR on a shared Redis handles this; heartbeats already list workers).
