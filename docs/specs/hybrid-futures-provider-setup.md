# Hybrid Market Scanner Provider Setup (Real-Time Futures + Bulk Stocks/Crypto)

## Overview

This specification outlines the technical setup for real-time **Futures scanning**
(`ES`, `NQ`, `YM`, `CL`, `GC`, and micros) alongside bulk **Stocks & Crypto scanning**
(300+ symbols) in TradingDiary.

### Provider decision (IBKR over Databento)

We already ship `DatabentoProvider` (GLBX.MDP3 CME) and it works, but real-time CME
via Databento runs ~**$200/mo**. Interactive Brokers offers the same CME real-time
data through the **CME Non-Professional bundle (~$1.25/mo)** on a funded account.

The trade we are accepting: IBKR is ~150x cheaper in dollars but costs us a
**stateful, session-bound sidecar** (daily re-auth, weekly restart, binary socket,
contract qualification). Databento is a stateless HTTPS call. For a low-symbol-count
futures scan the dollar delta dominates, so we route futures through IBKR **and keep
Databento/Yahoo as automatic fallbacks** so a gateway outage degrades instead of
breaking the scan.

### Key Objectives
1. **Real-time futures for ~$1.25/mo** via IBKR, without hitting IBKR's
   60-requests/10-min historical pacing limit.
2. **Bulk stocks & crypto unchanged** — Tiingo / Polygon / Yahoo via the existing
   provider factory.
3. **Headless deployment** integrated into our existing `docker-compose.yml` /
   `deploy.sh` on the Ubuntu host.

---

## 0. As-built status (MVP implemented)

The MVP is built and verified against a live gateway. What was proven:

- **Historical bars need NO real-time market-data subscription.** We pulled 552 real
  5-min bars for MES/MGC/MNQ front months on a closed-market Sunday, through the actual
  `getActiveProvider()` factory. So the free path works today; the ~$1.25/mo CME bundle
  is only needed for *live/streaming* freshness (Phase 2).
- **Two-phase design.** For a small futures set (5–10 roots) on a ≥1-min cadence,
  **historical polling stays under IBKR's 60/10-min pacing limit**, so the MVP needs no
  streaming sidecar — it fits the scanner's existing `fetchRecentCandles()` pull model.
  Streaming (Section 1) becomes necessary only for sub-minute freshness or many symbols.

Implemented pieces:
- `lib/chart/ibkr-client.ts` — persistent single-socket client: front-month contract
  qualification (cached, re-qualified daily for rollover), `reqHistoricalData`, and a
  sliding-window **pacing guard** (`PACING_MAX=50`/10 min) that throws → factory fallback.
- `IBKRProvider` + `FallbackProvider` in `lib/chart/providers.ts`; futures `auto` routing
  now degrades **IBKR → Databento → Yahoo**.
- `getActiveProvider(symbol, userConfig, assetClass)` — a watch's `assetClass: 'futures'`
  now routes bare roots (e.g. `MES`) to futures, not just contract-coded notations.
- `docker-compose.ibkr.yml` + `.env.ibkr` — gateway-only local stack (VNC, read-only API).

Open item: confirm real-time entitlement (Client Portal, or re-probe when Globex is open).

## 1. Phase 2 — streaming for scale/real-time

The MVP polls `reqHistoricalData`. That is throttled to ~60 requests / 10 min (6/min), so
it holds only for a **small** symbol set. To scan many futures, or to get sub-minute
freshness, switch to **streaming with a local cache** (build this only when the symbol
count or latency need actually demands it):

```
  ┌──────────────────────┐   TWS socket (4001)   ┌────────────────────────┐
  │   IB Gateway         │◀─────────────────────▶│  ibkr-feed sidecar     │
  │   (headless, IBC)    │   reqRealTimeBars      │  (@stoqey/ib)          │
  └──────────────────────┘   5s bars, streaming   │  aggregates 5s→1m/5m   │
                                                   └───────────┬────────────┘
                                                writes bars    │
                                                               ▼
                                                   ┌────────────────────────┐
                                                   │  Redis  bars:{root}:{tf}│
                                                   └───────────┬────────────┘
                                                     reads cache│
                                                               ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │  Scanner worker → IBKRProvider.fetchRecentCandles() reads Redis, never  │
  │  touches the socket. Falls back to Databento/Yahoo if cache is stale.   │
  └───────────────────────────────────────────────────────────────────────┘
```

- The **sidecar** holds one persistent socket, subscribes once per contract, and
  aggregates streaming 5s bars into 1m/5m/etc. buckets in memory, flushing each
  closed bar to Redis under `bars:{root}:{interval}` (a capped list, newest last).
- The **scanner** never opens a socket and issues no historical requests, so pacing
  limits are irrelevant. It reads the cache like any other provider.
- If the cache is missing or its newest bar is older than a staleness threshold
  (gateway re-authing, restart window), the provider **throws**, and the existing
  factory fallback chain serves Databento → Yahoo.

---

## 2. Provider seam (`lib/chart/providers.ts`)

Integrate as a `ChartProvider`, not a new ad-hoc function. This keeps futures routing,
usage metering (`trackProvider` / `recordProviderRequest`), and fallback all in one
place — `getActiveProvider()` already branches on `isFuturesSymbol()`.

```typescript
// New provider: reads the sidecar's Redis cache; never opens a socket.
export class IBKRProvider implements ChartProvider {
  name = "IBKR (CME real-time)";
  constructor(private redis: RedisClient, private maxStaleSec = 90) {}

  async fetchCandles(symbol: string, _date: string, interval: string) {
    return this.fetchRecentCandles(symbol, interval);
  }

  async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
    const root = futuresRoot(symbol);                 // MNQU6 -> MNQ (existing helper)
    const key = `bars:${root}:${interval}`;
    const rows = await this.redis.lrange(key, -288, -1);
    const candles = rows.map(parseBar).filter(Boolean) as OHLCCandle[];
    const newest = candles.at(-1);
    if (!newest || nowSec() - newest.time > this.maxStaleSec) {
      throw new Error(`IBKR cache stale for ${root}:${interval}`); // -> factory fallback
    }
    return candles;
  }
}
```

Wire it into the futures branch ahead of Databento (around
`lib/chart/providers.ts:655`):

```typescript
if (isFutures) {
  const futuresPref = userConfig?.futuresProvider || 'ibkr';
  if ((futuresPref === 'ibkr' || futuresPref === 'auto') && redisAvailable()) {
    try { return trackProvider(new IBKRProvider(redis), 'owner'); } catch {}
  }
  const databentoKey = userConfig?.databentoKey || process.env.DATABENTO_API_KEY;
  if (databentoKey) return trackProvider(new DatabentoProvider(databentoKey), owner(userConfig?.databentoKey));
  return trackProvider(new YahooProvider(), 'owner');
}
```

Because `IBKRProvider.fetchRecentCandles` throws on stale/missing cache, the caller in
`fetchCandles` ([lib/scanner/candles.ts:114](../../lib/scanner/candles.ts#L114)) needs a
try/next-provider path, OR the factory returns a small composite that tries IBKR then
Databento then Yahoo. Prefer the composite so `candles.ts` stays provider-agnostic.

---

## 3. The `ibkr-feed` sidecar

A tiny Node service (own entrypoint, same repo) that:

1. Connects to IB Gateway over the TWS socket (`@stoqey/ib`, host `ib-gateway`, port `4001`).
2. **Qualifies contracts**: for each configured root, resolves the live front-month
   contract via `reqContractDetails` (root + `CME`/`NYMEX`/`COMEX` exchange + expiry),
   and re-qualifies on rollover. Do not pass bare `ES` — IBKR requires a qualified contract.
3. Subscribes with `reqRealTimeBars` (5s bars) per contract.
4. Aggregates 5s → the intervals the scanner uses (1m, 5m, 10m …) and writes each
   **closed** bar to Redis `bars:{root}:{interval}` (LPUSH/RPUSH + LTRIM to cap length).
5. Publishes a `feed:health` key (last-bar timestamp per root, session state) for the
   health check.

Config: the set of roots to stream comes from the active watchlist (query the same
source the scanner uses) so we only subscribe to symbols actually being scanned — IBKR
market-data lines are limited.

---

## 4. Auth lifecycle (the part that actually breaks headless)

A live IBKR login does **not** stay up on its own. Plan for all of it:

- **IBC automation**: use an IB Gateway image that bundles IBC (e.g.
  `ghcr.io/gnzsnz/ib-gateway`) to script the login. *Verify the exact image name/tag
  before use — the earlier `gnzlabs` reference was wrong.*
- **2FA**: live accounts typically force IBKR Mobile 2FA, which is fatal headless.
  Either enable a no-2FA path for the API user where permitted, or accept a manual
  daily approval. Confirm this **before** building — it can veto the whole approach.
- **Daily auto-logout + weekly Sunday restart**: schedule a container/gateway restart
  and let IBC re-login. The scanner must tolerate the gap via fallback.
- **Secondary user — least privilege (critical).** Create a secondary user
  (`yourname_api`) and grant it **market data only**; deny trading and account-info
  access in Client Portal → Users & Access Rights. This matters for three reasons:
  (1) avoids evicting your manual TWS / mobile session, (2) isolates the ~$1.25/mo CME
  subscription, and (3) **security** — `READ_ONLY_API=yes` blocks orders but does NOT
  block reads: any code reaching port 4001 on the primary login can read your account
  numbers, full positions, and balances. A market-data-only secondary user is refused
  that data by IBKR itself, so a compromised sidecar leaks nothing. The sidecar must
  also only ever call `reqContractDetails` / `reqMktData` / `reqRealTimeBars` — never
  `reqPositions` / `reqAccountSummary`.
- **Health check**: the scanner (via the provider's staleness throw) already degrades
  to Databento/Yahoo when `feed:health` goes stale — no separate wiring needed, but
  alert on prolonged staleness.

---

## 5. Docker Compose integration

```yaml
services:
  ib-gateway:
    image: ghcr.io/gnzsnz/ib-gateway:stable   # verify tag; bundles IBC
    container_name: ${APP_NAME:-tradingdiary}-ibkr
    restart: unless-stopped
    environment:
      TWS_USERID: ${IBKR_API_USER}
      TWS_PASSWORD: ${IBKR_API_PASSWORD}
      TRADING_MODE: "live"
      READ_ONLY_API: "yes"
      TWOFA_TIMEOUT_ACTION: "restart"
    ports:
      - "127.0.0.1:4001:4001"   # bound to loopback; never expose publicly

  ibkr-feed:
    build: { context: ., dockerfile: docker/ibkr-feed.Dockerfile }
    container_name: ${APP_NAME:-tradingdiary}-ibkr-feed
    restart: unless-stopped
    depends_on: [ib-gateway, redis]
    environment:
      IBKR_GATEWAY_HOST: "ib-gateway"
      IBKR_GATEWAY_PORT: "4001"
      REDIS_URL: "redis://redis:6379"

  scanner:
    environment:
      REDIS_URL: "redis://redis:6379"           # reads bars cache
      FUTURES_PROVIDER: "ibkr"                    # default routing
      DATABENTO_API_KEY: ${DATABENTO_API_KEY:-}  # optional fallback
```

**Secrets**: `IBKR_API_USER` / `IBKR_API_PASSWORD` are live-account credentials on an
internet-facing host. Keep them in a restricted-perm `.env` (or Docker secrets), never
in the repo, and never expose port 4001 beyond loopback.

---

## 6. Deployment workflow (`./deploy.sh`)

1. Add `IBKR_API_USER`, `IBKR_API_PASSWORD` (and optional `DATABENTO_API_KEY`) to
   `/srv/tradingdiary/.env`.
2. Commit code (`IBKRProvider`, `ibkr-feed`, compose changes) to `main`.
3. Run `./deploy.sh` → `docker compose up -d --build` starts `ib-gateway`,
   `ibkr-feed`, `web`, `scanner`, `postgres`, `redis`.
4. Confirm the acceptance criteria below before calling it done.

---

## 7. Acceptance criteria (definition of done)

Container startup is **not** the finish line. This is:

- [ ] `ibkr-feed` authenticates and holds a session for >24h across the daily
      auto-logout (survives one restart cycle).
- [ ] `bars:{root}:{interval}` in Redis advances in ~real time (newest bar < 90s old)
      for every configured futures root during CME hours.
- [ ] `IBKRProvider.fetchRecentCandles()` returns those bars and they land in
      `server_watch_state` for a futures watch.
- [ ] Killing `ib-gateway` makes the scanner fall back to Databento/Yahoo with **no
      gaps or crashes** in futures scans; recovery is automatic when it returns.
- [ ] Provider usage metering records IBKR requests (`recordProviderRequest`).

---

## Status & Checklist

- [x] Provider comparison & futures feasibility analysis
- [x] Spec created (`docs/specs/hybrid-futures-provider-setup.md`)
- [x] Gateway smoke test — headless login, 2FA, read-only API, API handshake, contract
      qualification, historical bars (`docker-compose.ibkr.yml`)
- [x] Build `IBKRProvider` (historical MVP) + `FallbackProvider` + `ibkr-client.ts`
- [x] Route bare-root futures via `assetClass` in `getActiveProvider`
- [x] Verified real MES/MGC/MNQ bars through the factory; existing tests green
- [ ] Confirm real-time entitlement (Client Portal) or re-probe when Globex is open
- [ ] Run the live scanner locally with `IBKR_GATEWAY_HOST` set; confirm futures watches
      persist IBKR candles to `server_watch_state`
- [ ] Server: create least-privilege secondary user + CME bundle; add `ib-gateway` to the
      deploy `docker-compose.yml`; wire scanner env; validate acceptance criteria
- [ ] Phase 2 (only if needed): streaming `ibkr-feed` sidecar for scale/real-time
</content>
</invoke>
