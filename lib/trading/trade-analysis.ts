import type { AggregatedTrade } from './aggregator';
import type { TransactionRecord } from '../db/schema';
import type { OHLCCandle } from '../chart/types';

// ============================================================================
// Public context contract (see docs/specs/trade-ai-assistant-notes.md §3)
// ============================================================================

export type ExcursionMetric = {
  amount: number; // Dollar value ($)
  points: number; // Price move ($ per share / contract points)
  percent: number; // Percentage move (%)
};

export type GivebackMetric = {
  amount: number; // Dollar value ($)
  percentOfMFE: number; // Percentage of peak MFE given back (%)
};

export type TradeAnalysisRisk = {
  initialStop?: number;
  initialTarget?: number;
  plannedRiskAmount?: number;
  initialR?: number;
};

export type TradeAnalysisEvent = {
  type:
    | 'ENTRY'
    | 'SCALE_IN'
    | 'SCALE_OUT'
    | 'TARGET_TOUCH'
    | 'STOP_TOUCH'
    | 'MFE'
    | 'MAE'
    | 'EXIT';
  timestamp: number; // ms (ET wall-clock basis)
  price?: number;
  quantity?: number;
  source: 'EXECUTION' | 'MARKET_DATA' | 'DERIVED';
};

export type TradeAnalysisContext = {
  trade: {
    tradeGroupId: string;
    symbol: string;
    currency: string;
    side: 'LONG' | 'SHORT';
    openedAt: number;
    closedAt?: number;
    entryPrice: number;
    exitPrice?: number;
    netPnL: number;
    maxPositionQuantity: number;
  };
  executions: {
    timestamp: number;
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
  }[];
  risk?: TradeAnalysisRisk;
  marketContext?: {
    timeframe: string;
    candleCount: number;
  };
  metrics: {
    mfe: ExcursionMetric;
    mae: ExcursionMetric;
    rMultiple?: number;
    exitGivebackFromMFE?: GivebackMetric;
    timeToMfeMs?: number;
    holdingDurationMs: number;
  };
  events: TradeAnalysisEvent[];
  flags: {
    hasCandles: boolean;
    marketDataPriceMismatch: boolean;
    isDemoTrade: boolean;
    multipleRoundTrips: boolean;
    isOpen: boolean;
  };
  evidenceConfidence: 'low' | 'medium' | 'high';
};

// ============================================================================
// Time helpers — align execution wall-clock (ET) with UTC candle timestamps.
// Both are normalized to an "ET-display seconds" basis so windows line up.
// (Mirrors the offset math in components/journal/TradeChart.tsx.)
// ============================================================================

function getETOffsetSeconds(dateStr: string): number {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const refUTC = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const etHour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: 'numeric',
    })
      .formatToParts(refUTC)
      .find((p) => p.type === 'hour')?.value ?? '7'
  );
  return (etHour - 12) * 3600;
}

/** Execution date+time (ET wall clock) → seconds in the ET-display basis. */
function execSeconds(t: TransactionRecord): number {
  const y = parseInt(t.date.substring(0, 4));
  const m = parseInt(t.date.substring(4, 6)) - 1;
  const d = parseInt(t.date.substring(6, 8));
  const parts = (t.time || '00:00:00').split(':').map((n) => parseInt(n) || 0);
  const [hh, mm, ss] = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  return Math.floor(Date.UTC(y, m, d, hh, mm, ss) / 1000);
}

function intervalSeconds(interval = '5m'): number {
  const normalized = interval.toLowerCase();
  const value = parseInt(normalized, 10) || 5;
  if (normalized.endsWith('h')) return value * 60 * 60;
  if (normalized.endsWith('s')) return value;
  return value * 60;
}

// ============================================================================
// Deterministic analyzer
// ============================================================================

const isOpening = (side: TransactionRecord['side']) =>
  side === 'BUYTOOPEN' || side === 'SELLTOOPEN';
const buySell = (side: TransactionRecord['side']): 'BUY' | 'SELL' =>
  side === 'BUYTOOPEN' || side === 'BUYTOCLOSE' ? 'BUY' : 'SELL';

function weightedAvg(rows: { price: number; qty: number }[]): number {
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  if (totalQty <= 0) return 0;
  return rows.reduce((s, r) => s + r.price * r.qty, 0) / totalQty;
}

/**
 * Build the full deterministic context for a trade group. Pure: no I/O.
 * Candles should be the intraday bars for the trade's date (from the shared
 * market-data cache via lib/chart/fetch.ts); pass [] when unavailable.
 */
export function buildTradeAnalysisContext(
  trade: AggregatedTrade,
  candles: OHLCCandle[],
  opts?: { interval?: string; risk?: TradeAnalysisRisk; isDemoTrade?: boolean }
): TradeAnalysisContext {
  const tradeGroupId = `${trade.date}:${trade.symbol}`;
  const side = trade.side;
  const multiplier = trade.transactions[0]?.multiplier || 1;

  // ── Normalize executions in true execution order ──
  const execs = [...trade.transactions]
    .map((t) => ({
      t,
      seconds: execSeconds(t),
      side: buySell(t.side),
      price: Math.abs(t.price),
      qty: Math.abs(t.quantity),
      opening: isOpening(t.side),
    }))
    .sort((a, b) => a.seconds - b.seconds);

  const openingRows = execs.filter((e) => e.opening);
  const closingRows = execs.filter((e) => !e.opening);

  const entryPrice = weightedAvg(openingRows.map((e) => ({ price: e.price, qty: e.qty })));
  const exitPrice = closingRows.length
    ? weightedAvg(closingRows.map((e) => ({ price: e.price, qty: e.qty })))
    : undefined;

  // ── Running position: peak size + round-trip detection ──
  let running = 0;
  let maxPositionQuantity = 0;
  let roundTrips = 0;
  for (const e of execs) {
    const signed = e.side === 'BUY' ? e.qty : -e.qty;
    const before = running;
    running += signed;
    maxPositionQuantity = Math.max(maxPositionQuantity, Math.abs(running));
    // Flat → non-flat → flat completes a round trip
    if (Math.abs(before) > 0.001 && Math.abs(running) <= 0.001) roundTrips += 1;
  }
  const multipleRoundTrips = roundTrips > 1;

  const openedAt = execs.length ? execs[0].seconds * 1000 : 0;
  const closedAt = !trade.isOpen && execs.length ? execs[execs.length - 1].seconds * 1000 : undefined;
  const holdingDurationMs =
    (closedAt ?? (execs.length ? execs[execs.length - 1].seconds * 1000 : openedAt)) - openedAt;

  // ── Holding-window candles (ET-display basis) ──
  const etOffset = getETOffsetSeconds(trade.date);
  const startSec = openedAt / 1000;
  const endSec = (closedAt ?? Number.POSITIVE_INFINITY) / 1000;
  const candleDurationSeconds = intervalSeconds(opts?.interval);
  const candidateWindowCandles = candles
    .map((c) => ({ ...c, etTime: c.time + etOffset }))
    // Include the bar containing an execution even when its bucket begins a few
    // seconds before the fill (for example, a 09:35:10 fill in the 09:35 bar).
    .filter((c) => c.etTime + candleDurationSeconds > startSec && c.etTime <= endSec);

  // Execution prices must be plausible inside their corresponding market-data
  // bars. This protects excursion metrics from split-adjustment mismatches and
  // synthetic/demo trades whose dates were shifted while prices stayed fixed.
  let matchedExecutionCandles = 0;
  let incompatibleExecutionCandles = 0;
  for (const execution of execs) {
    const candle = candidateWindowCandles.find(
      (c) => c.etTime <= execution.seconds && c.etTime + candleDurationSeconds > execution.seconds,
    );
    if (!candle) continue;
    matchedExecutionCandles += 1;
    const tolerance = Math.max(execution.price * 0.005, 0.05);
    if (execution.price < candle.low - tolerance || execution.price > candle.high + tolerance) {
      incompatibleExecutionCandles += 1;
    }
  }

  const marketDataPriceMismatch = matchedExecutionCandles > 0 && incompatibleExecutionCandles > 0;
  const windowCandles = marketDataPriceMismatch ? [] : candidateWindowCandles;
  const hasCandles = windowCandles.length > 0;

  // ── MFE / MAE (side-aware) ──
  const zeroExcursion: ExcursionMetric = { amount: 0, points: 0, percent: 0 };
  let mfe = zeroExcursion;
  let mae = zeroExcursion;
  let timeToMfeMs: number | undefined;
  let mfeTimestamp: number | undefined;
  let maeTimestamp: number | undefined;

  const toExcursion = (points: number): ExcursionMetric => {
    const p = Math.max(0, points);
    return {
      points: p,
      amount: p * maxPositionQuantity * multiplier,
      percent: entryPrice > 0 ? (p / entryPrice) * 100 : 0,
    };
  };

  if (hasCandles && entryPrice > 0) {
    let bestFav = -Infinity; // favorable extreme price
    let worstAdv = -Infinity; // adverse excursion magnitude
    for (const c of windowCandles) {
      if (side === 'LONG') {
        if (c.high - entryPrice > bestFav) {
          bestFav = c.high - entryPrice;
          mfeTimestamp = c.etTime * 1000;
        }
        if (entryPrice - c.low > worstAdv) {
          worstAdv = entryPrice - c.low;
          maeTimestamp = c.etTime * 1000;
        }
      } else {
        if (entryPrice - c.low > bestFav) {
          bestFav = entryPrice - c.low;
          mfeTimestamp = c.etTime * 1000;
        }
        if (c.high - entryPrice > worstAdv) {
          worstAdv = c.high - entryPrice;
          maeTimestamp = c.etTime * 1000;
        }
      }
    }
    mfe = toExcursion(bestFav);
    mae = toExcursion(worstAdv);
    if (mfeTimestamp != null) timeToMfeMs = Math.max(0, mfeTimestamp - openedAt);
  } else if (exitPrice != null && entryPrice > 0) {
    // Execution-only fallback: excursion inferred from realized move (low confidence).
    const realized = side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
    mfe = toExcursion(realized);
    mae = toExcursion(-realized);
  }

  // ── Exit giveback from MFE ──
  let exitGivebackFromMFE: GivebackMetric | undefined;
  if (exitPrice != null && entryPrice > 0 && mfe.points > 0) {
    const realizedPoints = side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
    const givebackPoints = Math.max(0, mfe.points - realizedPoints);
    const amount = givebackPoints * maxPositionQuantity * multiplier;
    exitGivebackFromMFE = {
      amount,
      percentOfMFE: mfe.amount > 0 ? (amount / mfe.amount) * 100 : 0,
    };
  }

  // ── R-multiple (only when risk parameters are supplied) ──
  let rMultiple: number | undefined;
  const risk = opts?.risk;
  if (risk?.initialStop != null && entryPrice > 0 && exitPrice != null) {
    const riskPerShare = Math.abs(entryPrice - risk.initialStop);
    if (riskPerShare > 0) {
      const realizedPoints = side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
      rMultiple = realizedPoints / riskPerShare;
    }
  }

  // ── Events ──
  const events: TradeAnalysisEvent[] = [];
  let seenOpening = false;
  let openClosedCount = 0;
  const totalClosing = closingRows.length;
  for (const e of execs) {
    if (e.opening) {
      events.push({
        type: seenOpening ? 'SCALE_IN' : 'ENTRY',
        timestamp: e.seconds * 1000,
        price: e.price,
        quantity: e.qty,
        source: 'EXECUTION',
      });
      seenOpening = true;
    } else {
      openClosedCount += 1;
      const isFinalClose = openClosedCount === totalClosing && !trade.isOpen;
      events.push({
        type: isFinalClose ? 'EXIT' : 'SCALE_OUT',
        timestamp: e.seconds * 1000,
        price: e.price,
        quantity: e.qty,
        source: 'EXECUTION',
      });
    }
  }
  if (mfeTimestamp != null && mfe.points > 0) {
    events.push({ type: 'MFE', timestamp: mfeTimestamp, source: 'MARKET_DATA' });
  }
  if (maeTimestamp != null && mae.points > 0) {
    events.push({ type: 'MAE', timestamp: maeTimestamp, source: 'MARKET_DATA' });
  }
  // Target / stop touches (require candles + risk levels)
  if (hasCandles && risk) {
    for (const c of windowCandles) {
      if (risk.initialTarget != null) {
        const hit = side === 'LONG' ? c.high >= risk.initialTarget : c.low <= risk.initialTarget;
        if (hit) {
          events.push({ type: 'TARGET_TOUCH', timestamp: c.etTime * 1000, price: risk.initialTarget, source: 'MARKET_DATA' });
          break;
        }
      }
    }
    for (const c of windowCandles) {
      if (risk.initialStop != null) {
        const hit = side === 'LONG' ? c.low <= risk.initialStop : c.high >= risk.initialStop;
        if (hit) {
          events.push({ type: 'STOP_TOUCH', timestamp: c.etTime * 1000, price: risk.initialStop, source: 'MARKET_DATA' });
          break;
        }
      }
    }
  }
  events.sort((a, b) => a.timestamp - b.timestamp);

  // ── Evidence confidence ceiling (data completeness, not opinion) ──
  let evidenceConfidence: TradeAnalysisContext['evidenceConfidence'];
  if (multipleRoundTrips || !hasCandles) {
    evidenceConfidence = 'low';
  } else if (!risk) {
    evidenceConfidence = 'medium';
  } else {
    evidenceConfidence = 'high';
  }

  return {
    trade: {
      tradeGroupId,
      symbol: trade.symbol,
      currency: trade.currency || 'USD',
      side,
      openedAt,
      closedAt,
      entryPrice,
      exitPrice,
      netPnL: trade.netPnL,
      maxPositionQuantity,
    },
    executions: execs.map((e) => ({
      timestamp: e.seconds * 1000,
      side: e.side,
      price: e.price,
      quantity: e.qty,
    })),
    risk,
    marketContext: {
      timeframe: opts?.interval ?? '5m',
      candleCount: windowCandles.length,
    },
    metrics: {
      mfe,
      mae,
      rMultiple,
      exitGivebackFromMFE,
      timeToMfeMs,
      holdingDurationMs,
    },
    events,
    flags: {
      hasCandles,
      marketDataPriceMismatch,
      isDemoTrade: opts?.isDemoTrade ?? false,
      multipleRoundTrips,
      isOpen: trade.isOpen,
    },
    evidenceConfidence,
  };
}

/**
 * Stable content hash of a context — used to detect when a saved AI review is
 * stale (executions or candles changed). djb2 over a canonical subset; no crypto
 * needed since this is a change-detection fingerprint, not a security boundary.
 */
export function hashTradeContext(ctx: TradeAnalysisContext): string {
  const canonical = JSON.stringify({
    t: ctx.trade,
    e: ctx.executions,
    r: ctx.risk ?? null,
    m: ctx.metrics,
    c: ctx.marketContext?.candleCount ?? 0,
    f: ctx.flags,
  });
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) {
    h = (h * 33) ^ canonical.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
