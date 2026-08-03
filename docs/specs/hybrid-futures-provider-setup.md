# Hybrid Market Scanner Provider Setup (IBKR Futures + Bulk Stocks/Crypto)

## Overview

Real-time (or recent) **futures scanning** (`ES`, `NQ`, `YM`, `RTY`, `CL`, `GC`, `SI`,
`ZB`, `BTC`, and micros) alongside bulk **stocks & crypto scanning**, routed through one
provider factory. Futures go to a headless **IB Gateway**; everything else stays on
Tiingo / Polygon / Yahoo. A fallback chain keeps futures scanning alive when the gateway
is down.

### Provider decision (IBKR over Databento)

Databento (GLBX.MDP3 CME) works but real-time CME runs ~**$200/mo**. IBKR delivers the
same CME data via the **CME Non-Professional bundle (~$1.25/mo)** on a funded account.
The trade: IBKR is far cheaper but costs us a **stateful, session-bound gateway** (weekly
2FA re-auth, contract qualification, a socket). We accept that and keep **Databento →
Yahoo as automatic fallbacks** so a gateway outage degrades instead of breaking scans.

**Key finding:** IBKR **historical** bars need **no** real-time market-data subscription,
so the MVP works today for free. The paid bundle is only needed for true live/streaming
freshness (Phase 2).

---

## 0. As-built status (MVP implemented & verified)

Everything below is built, committed, and verified against a live gateway.

| Area | Implementation |
|---|---|
| Socket client | `lib/chart/ibkr-client.ts` — one persistent socket, front-month contract qualification (cached, re-qualified daily → **auto rollover**), `reqHistoricalData`, sliding-window **pacing guard** (`PACING_MAX=50`/10min), symbol-alias map (`BTC`→`BRR`), tuned connect/request timeouts (8s/10s) under the scanner's 15s budget |
| Provider seam | `IBKRProvider` + `FallbackProvider` in `lib/chart/providers.ts`; futures `auto` = **IBKR → Databento → Yahoo** |
| Routing | `getActiveProvider(symbol, cfg, assetClass)` — `assetClass:'futures'` routes bare roots too, not just `=F`/contract notations |
| Source visibility | `effectiveProviderName()` reports the *winning* provider; scanner persists it to `server_watch_state.lastProvider`, `/api/watch` returns it, tiles/rows show an **IBKR/Yahoo badge** |
| UX | `displaySymbol()` strips `=F` for display (stored symbol stays canonical); clean ticker placeholder |
| Local stack | `docker-compose.ibkr.yml` (published ports + VNC for local testing) |
| Server stack | `docker-compose.ibkr.server.yml` — **decoupled** gateway project, no public API port, VNC loopback-only, daily no-2FA restart |
| Deploy | app `docker-compose.yml` scanner wired to `ib-gateway:4003` over shared external network `tradingdiary-ibkr-net`; `deploy.sh` ensures the network idempotently and **never touches the gateway** |
| Shared scanning | Futures integrated into the shared-acquisition layer: `ibkr-cme:server` scope, `IBKR (CME)` capability with chain-safe `=F` canonical, IBKR-shaped budget (300/hr). Dedup/governor/negative-cache apply to futures like everything else |
| Test harness | `dev-run.ts` accepts an asset-class arg; verified `NQ=F` → IBKR front month → persisted to DB |

**Verified:** MES/MGC/MNQ/NQ/BTC front months resolve on IBKR and return real bars through
`getActiveProvider()`; a full scheduler→worker→DB cycle persists IBKR candles with
`lastProvider = "IBKR (CME)"`; existing tests green.

**Open items:** see §7.

---

## 1. Architecture (MVP: historical polling)

The scanner's `fetchRecentCandles()` pull model is a good fit: for a small futures set
(≤~10 roots) on a ≥1-min cadence, polling `reqHistoricalData` stays under IBKR's
60/10-min pacing limit, so **no streaming sidecar is needed**.

```
  scanner worker ─ getActiveProvider(symbol, _, 'futures')
        │
        ▼  FallbackProvider "Futures (auto)"
   ┌────────────┬──────────────┬────────────┐
   │ IBKRProvider│ Databento    │ Yahoo      │   (first non-empty wins;
   │  (gateway)  │ (if key)     │ (always)   │    lastProviderUsed recorded)
   └─────┬───────┴──────────────┴────────────┘
         ▼ ibkr-client.ts (persistent socket)
   IB Gateway (headless, IBC) ── CME/CBOT/COMEX/NYMEX historical bars
```

Contract qualification resolves the **front month** and re-qualifies daily, so rollover is
automatic (calendar roll at expiry). Streaming for sub-minute freshness / many symbols is
**Phase 2** (§8).

---

## 2. Provider seam (`lib/chart/providers.ts`)

- `IBKRProvider.fetchRecentCandles()` delegates to the lazily-imported `ibkr-client.ts`
  (so `@stoqey/ib` never lands in the web bundle).
- `FallbackProvider` tries each provider in order, records `lastProviderUsed`, and throws
  only if all fail. `effectiveProviderName(provider)` returns the real winner.
- Futures branch of `getActiveProvider()`: `ibkr` when `IBKR_GATEWAY_HOST`/`IBKR_ENABLED`
  is set (server/scanner context), else Databento, else Yahoo; `auto` builds the fallback
  chain.
- `ibkr-client.ts` maps roots → exchange (COMEX/NYMEX/CBOT else CME), intervals → IB bar
  sizes, and aliases (`BTC`→`BRR`). Add new special symbologies to `IBKR_SYMBOL_ALIAS`.

---

## 3. Local development & testing

- **Gateway:** `docker-compose -f docker-compose.ibkr.yml --env-file .env.ibkr up` (creds
  in gitignored `.env.ibkr`; complete 2FA via VNC `localhost:5900` or IBKR Mobile).
- **Scanner/web against it:** set `IBKR_GATEWAY_HOST=127.0.0.1` / `IBKR_GATEWAY_PORT=4001`
  in `.env.local`, then `npm run scanner` (and/or `npm run dev`).
- **One-shot end-to-end:** `IBKR_GATEWAY_HOST=127.0.0.1 npx tsx lib/scanner/dev-run.ts "NQ=F" 10m futures`.
- Two fetch paths exist: the **web `/api/watch`** (browser tiles) and the **scanner
  worker**. Both read the same factory; each needs the gateway env in its own process.

---

## 4. Auth lifecycle (2FA)

- **IBC automation** via `ghcr.io/gnzsnz/ib-gateway`.
- **2FA cadence:** login once; IBC does **daily soft restarts that reuse the session (no
  2FA)**; IBKR forces a **weekly (Sunday) re-auth** — the only recurring 2FA. App deploys
  never restart the gateway, so they never trigger 2FA.
- **Goal:** the weekly re-auth should be a **phone tap** (IBKR Mobile IB Key push), not a
  VNC session. Requires IBC **device auto-selection** so it doesn't stall on the "IB Key /
  One-Time Passcode" picker. *(Not yet wired — see §7.)*
- **Fallback covers the gap:** during any re-auth, futures scans degrade to Yahoo and
  recover automatically.

---

## 5. Server deployment (decoupled)

The gateway runs as its **own compose project** so `deploy.sh` (app only) never restarts
it — its authenticated session survives every deploy.

```
docker-compose.yml             → web, postgres, redis, scanner   (deploy.sh runs this)
docker-compose.ibkr.server.yml → ib-gateway                      (started ONCE)
        └── shared external network: tradingdiary-ibkr-net
```

**One-time server setup:**
```bash
docker network create tradingdiary-ibkr-net
# add IBKR_USER / IBKR_PASSWORD / VNC_PASSWORD to /srv/tradingdiary/.env
docker compose -p tradingdiary-ibkr -f docker-compose.ibkr.server.yml up -d
# complete 2FA once via SSH-tunnel VNC:  ssh -L 5900:127.0.0.1:5900 root@SERVER → vnc://localhost:5900
```
Then `./deploy.sh` as often as needed — the gateway is untouched. Scanner reaches it at
`ib-gateway:4003` (internal socat bridge for the live API).

---

## 6. Security model

- **API has no password** — it trusts network reachability. Security = network isolation.
- Server gateway publishes **no host port** for the API (internal network only); **VNC
  bound to `127.0.0.1`** (SSH tunnel only). Verify: `nmap -p 4003,5900 SERVER` shows
  closed.
- **`READ_ONLY_API=yes`** blocks orders but **not reads** — any code reaching the gateway
  can read balances/positions on a full-access login.
- **Mitigation:** log the gateway in as a **market-data-only secondary user** (deny
  trading + account access in Client Portal). This also avoids evicting your personal TWS
  session (one active session per username) and isolates the CME subscription. *(User
  task — not yet created.)*

---

## 7. Acceptance criteria & open items

**MVP — done:**
- [x] Futures resolve on IBKR (front month, auto-roll) and return real bars through the factory.
- [x] Full scanner→worker→DB cycle persists IBKR candles; `lastProvider` shows the real source.
- [x] Fallback IBKR→Databento→Yahoo; UI shows the source badge.
- [x] Decoupled gateway compose + shared network; deploys don't restart the gateway.

**Still open:**
- [ ] **Market-open recency** — confirm `reqHistoricalData` returns bars up to *now* (vs ~15-min delayed) without the paid sub. Only testable when Globex is open.
- [ ] **Market-data-only secondary user** (Client Portal) — security + session-conflict + subscription. Deploy prerequisite.
- [ ] **IBC device auto-selection** in `docker-compose.ibkr.server.yml` so the weekly re-auth is a phone tap, not VNC.
- [ ] **Single-fetcher on the server** — have the browser read persisted `server_watch_state` instead of also live-calling `/api/watch` (avoids double-pulling against pacing).
- [ ] Confirm real futures count/intervals stay under the pacing guard and are in the bar-size map.

---

## 8. Phase 2 — streaming (deferred, only if needed)

For sub-minute freshness or many symbols, add an `ibkr-feed` sidecar: one socket,
`reqRealTimeBars` (5s), aggregate → Redis `bars:{root}:{interval}`; `IBKRProvider` reads
the cache instead of the socket (throws when stale → same fallback). Not required at
current scale.
</content>
