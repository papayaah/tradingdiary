# Hybrid Market Scanner Provider Setup (Real-Time Futures + Bulk Stocks/Crypto)

## Overview

This specification outlines the technical setup for real-time **Futures scanning** (`ES`, `NQ`, `YM`, `CL`, `GC`) alongside bulk **Stocks & Crypto scanning** (300+ symbols) in TradingDiary.

### Key Objectives
1. **Prevent Rate-Limiting & Pacing Violations**: Avoid IBKR's 60-requests/10-min historical pacing limits by scanning bulk stocks via Tiingo / Yahoo.
2. **Real-Time Futures for $1.25/mo**: Route futures contracts through Interactive Brokers (IBKR Client Portal API / IB Gateway) or Databento/Polygon.
3. **Headless Linux Ubuntu Docker Deployment**: Integrate the IB Gateway / Client Portal service directly into our existing `docker-compose.yml` and `deploy.sh` workflow.

---

## 1. Provider Routing Architecture

The scanner engine (`lib/scanner/candles.ts`) automatically routes requests based on symbol type:

```
                  ┌───────────────────────────────┐
                  │   Background Scan Task        │
                  │   (300+ Active Symbols)       │
                  └──────────────┬────────────────┘
                                 │
                 Is symbol a Futures contract?
                 (e.g., ES, NQ, CL, GC, YM, =F)
                                 │
                      ┌──────────┴──────────┐
                      │                     │
                   YES (10 Tickers)      NO (290 Tickers)
                      │                     │
                      ▼                     ▼
          ┌──────────────────────┐┌──────────────────────┐
          │  IBKR Gateway / API  ││   Tiingo / Polygon   │
          │  (Real-Time CME)     ││   (Bulk REST API)    │
          └──────────────────────┘└──────────────────────┘
```

---

## 2. Docker Compose Integration (`docker-compose.yml`)

To run the IB Gateway headlessly on our Linux Ubuntu server (`5.223.53.140`), we add an `ib-gateway` service to `docker-compose.yml`:

```yaml
services:
  # IBKR Gateway Headless Container
  ib-gateway:
    image: ghcr.io/gnzlabs/ib-gateway:latest
    container_name: ${APP_NAME:-tradingdiary}-ibkr
    restart: unless-stopped
    environment:
      TWS_USERID: ${IBKR_API_USER}
      TWS_PASSWORD: ${IBKR_API_PASSWORD}
      TRADING_MODE: "live"
      READ_ONLY_API: "yes"
    ports:
      - "127.0.0.1:4001:4001"
```

In `scanner` service environment:
```yaml
  scanner:
    environment:
      IBKR_GATEWAY_URL: "http://ib-gateway:4001"
```

---

## 3. IBKR Secondary User Setup (Zero Extra Account Cost)

To prevent IBKR from logging out manual TWS or IBKR Mobile sessions:
1. Log into IBKR Client Portal $\rightarrow$ **Settings** $\rightarrow$ **Users & Access Rights**.
2. Click **Add Secondary User** (e.g. `yourname_api`).
3. Subscribe `yourname_api` to the **CME Non-Professional Data Bundle ($1.25/mo)**.
4. Pass `IBKR_API_USER` and `IBKR_API_PASSWORD` in `/srv/tradingdiary/.env` on the server.

---

## 4. Code Implementation Steps (`lib/scanner/candles.ts`)

```typescript
import { isFuturesSymbol } from '@/lib/scanner/symbols';

export async function fetchCandlesForSymbol(symbol: string, interval: string) {
  // 1. Route Futures symbols to IBKR Gateway
  if (isFuturesSymbol(symbol)) {
    return await fetchIBKRFuturesCandles(symbol, interval);
  }

  // 2. Route Stocks & Crypto to Tiingo / Polygon / Yahoo fallback
  return await fetchTiingoCandles(symbol, interval);
}
```

---

## 5. Deployment Workflow (`./deploy.sh`)

1. Add `IBKR_API_USER` and `IBKR_API_PASSWORD` to `/srv/tradingdiary/.env`.
2. Commit code changes to `main`.
3. Run `./deploy.sh`.
4. `deploy.sh` executes `docker compose up -d --build` on `5.223.53.140`, starting the `ib-gateway` container alongside `web`, `scanner`, `postgres`, and `redis`.

---

## Status & Checklist

- [x] Provider Comparison & Futures Feasibility Analysis
- [x] Spec Created (`docs/specs/hybrid-futures-provider-setup.md`)
- [ ] Create Secondary IBKR API User in Client Portal
- [ ] Add `ib-gateway` service to `docker-compose.yml`
- [ ] Wire IBKR provider route in `lib/scanner/candles.ts`
- [ ] Execute `./deploy.sh` to verify Ubuntu container startup
