// Persistent IBKR Gateway connection for the scanner. Holds ONE socket to the
// headless IB Gateway (see docker-compose.ibkr.yml), resolves each futures
// root's active (most-liquid) contract via the continuous future — the same
// contract TWS charts by default — cached and re-qualified daily for rollover,
// and pulls recent historical bars. A sliding-window pacing guard keeps us under
// IBKR's ~60-requests/10-min historical limit; on breach we throw so the
// provider factory falls back to Yahoo.
//
// Historical bars need no real-time market-data subscription, so this works
// today. Real-time streaming (reqRealTimeBars) is a later phase.

import { IBApi, EventName, SecType, type BarSizeSetting, type Contract } from '@stoqey/ib';
import type { OHLCCandle } from './types';
import { futuresRoot } from './providers';

const HOST = process.env.IBKR_GATEWAY_HOST || '127.0.0.1';
const PORT = Number(process.env.IBKR_GATEWAY_PORT || 4001);
const BASE_CLIENT_ID = Number(process.env.IBKR_CLIENT_ID || 7);
// Rotate the clientId across reconnects. When the gateway restarts (nightly auto
// restart or a re-auth), the old clientId can stay "in use" on the gateway for a
// while, so immediately reconnecting with the SAME id yields a dead/zombie socket
// (the bug that forced manual scanner restarts). Cycling through a few ids sidesteps
// the stale registration so the reconnect is clean. Step of 10 keeps the scanner's
// ids (7,17,27,37) disjoint from the web's (8,18,28,38).
const CLIENT_ID_ROTATION = 4;

// A down gateway fails instantly (connection refused), so this timeout only
// guards rare hangs. Kept under the scanner's per-fetch budget
// (SCANNER_FETCH_TIMEOUT_MS, default 15s) so the FallbackProvider still reaches
// Yahoo within the same tick, but high enough for a cold first connect
// (the persistent singleton pays this once at startup, not per scan).
const CONNECT_TIMEOUT_MS = 8_000;
const REQUEST_TIMEOUT_MS = 10_000;
// Stay well under IBKR's 60/10min. Reject locally before IBKR paces us.
const PACING_MAX = 50;
const PACING_WINDOW_MS = 10 * 60 * 1000;

/** IB "info" codes that are connection-status noise, not real errors. */
const BENIGN_CODES = new Set([2104, 2106, 2107, 2108, 2158, 2103, 2100, 2119, 2168, 2169]);

// A few roots whose IBKR request `symbol` differs from the common ticker.
// e.g. CME Bitcoin futures are requested as BRR (trading class BTC), not BTC.
const IBKR_SYMBOL_ALIAS: Record<string, string> = {
  BTC: 'BRR', // CME Bitcoin future (symbol=BRR, localSymbol=BTCU6, tradingClass=BTC)
};

// Contract routing for roots that do not trade as USD-denominated CME futures.
const EXCHANGE_BY_ROOT: Record<string, string> = {
  GC: 'COMEX', MGC: 'COMEX', SI: 'COMEX', SIL: 'COMEX', HG: 'COMEX',
  CL: 'NYMEX', MCL: 'NYMEX', NG: 'NYMEX', QM: 'NYMEX', RB: 'NYMEX', HO: 'NYMEX',
  YM: 'CBOT', MYM: 'CBOT', ZB: 'CBOT', ZN: 'CBOT', ZF: 'CBOT', ZT: 'CBOT',
  ZC: 'CBOT', ZS: 'CBOT', ZW: 'CBOT',
  K200: 'KSE',
  HSI: 'HKFE',
  SPI: 'SNFE',
  SSG: 'SGX',
};

const CURRENCY_BY_ROOT: Record<string, string> = {
  NIY: 'JPY',
  K200: 'KRW',
  HSI: 'HKD',
  SPI: 'AUD',
  SSG: 'SGD',
};

const BAR_SIZE_BY_INTERVAL: Record<string, string> = {
  '5s': '5 secs', '10s': '10 secs', '15s': '15 secs', '30s': '30 secs',
  '1m': '1 min', '2m': '2 mins', '3m': '3 mins', '5m': '5 mins',
  '10m': '10 mins', '15m': '15 mins', '30m': '30 mins',
  '1h': '1 hour', '2h': '2 hours', '4h': '4 hours', '1d': '1 day',
};

function exchangeForRoot(root: string): string {
  return EXCHANGE_BY_ROOT[root.toUpperCase()] || 'CME';
}

export function ibkrContractSpecForRoot(root: string): Pick<Contract, 'symbol' | 'exchange' | 'currency'> {
  const normalizedRoot = root.toUpperCase();
  return {
    symbol: IBKR_SYMBOL_ALIAS[normalizedRoot] ?? normalizedRoot,
    exchange: exchangeForRoot(normalizedRoot),
    currency: CURRENCY_BY_ROOT[normalizedRoot] ?? 'USD',
  };
}

function barSizeForInterval(interval: string): string {
  const size = BAR_SIZE_BY_INTERVAL[interval];
  if (!size) throw new Error(`IBKR: unsupported interval "${interval}"`);
  return size;
}

/** How much history to request so the recent window is comfortably filled. */
function durationForInterval(interval: string): string {
  if (interval.endsWith('s')) return '3600 S';
  if (interval.endsWith('h')) return '10 D';
  if (interval === '1d') return '6 M';
  return '2 D'; // minute bars
}

/** YYYYMMDD in New York, used to detect a new day (front-month rollover). */
function nyDate(): string {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}${g('month')}${g('day')}`;
}

interface PendingDetails {
  contracts: Contract[];
  resolve: (c: Contract) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
interface PendingHistory {
  bars: OHLCCandle[];
  resolve: (b: OHLCCandle[]) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class IbkrClient {
  private ib: IBApi | null = null;
  private ready: Promise<void> | null = null;
  private nextReqId = 1;
  private readonly detailReqs = new Map<number, PendingDetails>();
  private readonly historyReqs = new Map<number, PendingHistory>();
  private readonly contractCache = new Map<string, { contract: Contract; day: string }>();
  private readonly requestTimes: number[] = [];
  private connectSeq = 0;

  private connect(): Promise<void> {
    if (this.ready) return this.ready;
    // Fresh clientId each (re)connect so a stale registration on the gateway
    // (after its nightly restart/re-auth) doesn't hand us a zombie socket.
    const clientId = BASE_CLIENT_ID + (this.connectSeq++ % CLIENT_ID_ROTATION) * 10;
    this.ready = new Promise<void>((resolve, reject) => {
      const ib = new IBApi({ host: HOST, port: PORT, clientId });
      this.ib = ib;

      const timer = setTimeout(() => {
        reject(new Error(`IBKR connect timeout (${HOST}:${PORT})`));
        this.teardown();
      }, CONNECT_TIMEOUT_MS);

      const onReady = () => { clearTimeout(timer); resolve(); };
      ib.once(EventName.connected, onReady);
      ib.once(EventName.nextValidId, onReady);

      ib.on(EventName.error, (err: unknown, code: number, reqId: number) => {
        if (BENIGN_CODES.has(code)) return;
        const message = `IBKR error ${code}: ${String(err).slice(0, 160)}`;
        // Route the error to whichever request owns reqId; else it's fatal-ish.
        const d = this.detailReqs.get(reqId);
        if (d) { clearTimeout(d.timer); this.detailReqs.delete(reqId); d.reject(new Error(message)); return; }
        const h = this.historyReqs.get(reqId);
        if (h) { clearTimeout(h.timer); this.historyReqs.delete(reqId); h.reject(new Error(message)); return; }
      });

      ib.on(EventName.contractDetails, (reqId: number, details: { contract: Contract }) => {
        this.detailReqs.get(reqId)?.contracts.push(details.contract);
      });
      ib.on(EventName.contractDetailsEnd, (reqId: number) => {
        const req = this.detailReqs.get(reqId);
        if (!req) return;
        clearTimeout(req.timer);
        this.detailReqs.delete(reqId);
        const today = nyDate();
        // For a FUT request IBKR returns every listed month; pick the nearest
        // non-expired one. For a CONTFUT request it returns the single resolved
        // continuous (active/most-liquid) contract — which may not carry a
        // month field — so fall back to the first contract when none match the
        // expiry filter, rather than failing.
        const future = req.contracts
          .filter((c) => c.lastTradeDateOrContractMonth && String(c.lastTradeDateOrContractMonth) >= today)
          .sort((a, b) => String(a.lastTradeDateOrContractMonth).localeCompare(String(b.lastTradeDateOrContractMonth)));
        const chosen = future[0] ?? req.contracts[0];
        if (!chosen) { req.reject(new Error('IBKR: no active contract')); return; }
        req.resolve(chosen);
      });

      ib.on(
        EventName.historicalData,
        (reqId: number, time: string, open: number, high: number, low: number, close: number, volume: number) => {
          const req = this.historyReqs.get(reqId);
          if (!req) return;
          if (String(time).startsWith('finished')) {
            clearTimeout(req.timer);
            this.historyReqs.delete(reqId);
            req.resolve(req.bars);
            return;
          }
          // formatDate=2 => epoch seconds; IBKR sends -1 for empty OHLC.
          if (open >= 0 && close >= 0) {
            req.bars.push({ time: Number(time), open, high, low, close, volume: volume >= 0 ? volume : 0 });
          }
        },
      );

      ib.on(EventName.disconnected, () => this.teardown());
      ib.connect();
    });
    return this.ready;
  }

  private teardown() {
    for (const [, d] of this.detailReqs) { clearTimeout(d.timer); d.reject(new Error('IBKR disconnected')); }
    for (const [, h] of this.historyReqs) { clearTimeout(h.timer); h.reject(new Error('IBKR disconnected')); }
    this.detailReqs.clear();
    this.historyReqs.clear();
    try { this.ib?.disconnect(); } catch { /* ignore */ }
    this.ib = null;
    this.ready = null;
  }

  private takePacingSlot() {
    const now = Date.now();
    while (this.requestTimes.length && now - this.requestTimes[0] > PACING_WINDOW_MS) this.requestTimes.shift();
    if (this.requestTimes.length >= PACING_MAX) {
      throw new Error(`IBKR pacing guard: ${this.requestTimes.length} reqs in window`);
    }
    this.requestTimes.push(now);
  }

  /** One reqContractDetails round-trip for a root at a given security type. */
  private async requestContract(root: string, secType: SecType): Promise<Contract> {
    await this.connect();
    this.takePacingSlot();
    const reqId = this.nextReqId++;
    return new Promise<Contract>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.detailReqs.delete(reqId);
        reject(new Error(`IBKR contractDetails timeout for ${root}`));
      }, REQUEST_TIMEOUT_MS);
      this.detailReqs.set(reqId, { contracts: [], resolve, reject, timer });
      this.ib!.reqContractDetails(reqId, { ...ibkrContractSpecForRoot(root), secType });
    });
  }

  /**
   * Resolve the contract to fetch bars from, cached per NY day (auto-rollover).
   *
   * Prefer the CONTINUOUS future (CONTFUT): IBKR maps it to the currently
   * active/most-liquid contract — the same one TWS charts by default — so
   * products whose nearest-expiry month is a thin serial/expiring contract
   * (gold, silver) return dense data instead of a near-empty chart. Fall back to
   * nearest-expiry FUT if CONTFUT is unavailable, so index futures (whose nearest
   * quarterly already IS the active contract) never regress.
   */
  private async qualifyActiveContract(root: string): Promise<Contract> {
    const today = nyDate();
    const cached = this.contractCache.get(root);
    if (cached && cached.day === today) return cached.contract;

    let contract: Contract;
    try {
      contract = await this.requestContract(root, SecType.CONTFUT);
    } catch {
      contract = await this.requestContract(root, SecType.FUT);
    }
    this.contractCache.set(root, { contract, day: today });
    return contract;
  }

  async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
    // Compute bar size first so an unsupported interval fails fast, before we
    // touch (and would then needlessly reset) a healthy connection.
    const barSize = barSizeForInterval(interval);
    const duration = durationForInterval(interval);
    const root = futuresRoot(symbol);
    try {
      const contract = await this.qualifyActiveContract(root);
      await this.connect();
      this.takePacingSlot();
      const reqId = this.nextReqId++;
      const bars = await new Promise<OHLCCandle[]>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.historyReqs.delete(reqId);
          reject(new Error(`IBKR historicalData timeout for ${root} ${interval}`));
        }, REQUEST_TIMEOUT_MS);
        this.historyReqs.set(reqId, { bars: [], resolve, reject, timer });
        // endDateTime '' = up to now; whatToShow TRADES; useRTH 0 = all Globex
        // hours (scanner applies its own session filter); formatDate 2 = epoch.
        this.ib!.reqHistoricalData(reqId, contract, '', duration, barSize as BarSizeSetting, 'TRADES', 0, 2, false);
      });
      bars.sort((a, b) => a.time - b.time);
      return bars;
    } catch (err) {
      // Self-heal: a connect/request timeout, disconnect, or stuck socket
      // otherwise leaves a zombie connection (clientId registered but dead) that
      // never recovers without a manual restart — exactly what we hit after a
      // gateway re-auth. Drop it so the NEXT call reconnects fresh. The pacing
      // guard is not a connection fault, so leave a healthy socket alone there.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('pacing guard')) this.teardown();
      throw err;
    }
  }
}

let singleton: IbkrClient | null = null;

/** Lazy shared client for the current process (scanner worker holds one socket). */
export function getIbkrClient(): IbkrClient {
  if (!singleton) singleton = new IbkrClient();
  return singleton;
}

/** True when the gateway is configured for this process. */
export function ibkrConfigured(): boolean {
  return Boolean(process.env.IBKR_GATEWAY_HOST) || process.env.IBKR_ENABLED === 'true';
}
