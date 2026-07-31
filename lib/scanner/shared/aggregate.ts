// Pure base-interval aggregation (Phase 4 of shared-market-data-scanning).
//
// Derives a larger interval (5m/10m/15m/...) from a 1m base candle series so the
// scanner can fetch 1m ONCE and serve every higher interval from it, instead of
// one upstream request per interval. Aggregation is opt-in (SCANNER_AGGREGATION)
// and only applied for providers the capability registry marks aggregatableFrom1m.
//
// Correctness rules (per spec):
//   - buckets align to interval boundaries on the provider's own timestamps
//     (epoch-floored; 09:30 ET / RTH open lands on 5/10/15m boundaries in UTC);
//   - open = first bar, close = last bar, high = max, low = min, volume = sum;
//   - the latest bucket may be partially formed — it is kept, with its stable
//     bucket-start `time`, so intrabar evaluation and alert dedup are preserved;
//   - inconsistent base bars (duplicated or out of order) are rejected rather
//     than aggregated into a fabricated candle — the caller then falls back to a
//     native fetch of the requested interval.

import type { Candle } from '@/lib/scanner/patterns';

export const BASE_INTERVAL = '1m';

export interface AggregationResult {
  ok: boolean;
  candles: Candle[];
  reason?: string;
}

/** Parse an interval like "1m", "10m", "2h" into whole minutes; null if unsupported. */
export function parseIntervalMinutes(interval: string): number | null {
  const match = /^(\d+)(m|h)$/.exec(interval.trim());
  if (!match) return null; // seconds or malformed: cannot derive from 1m
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2] === 'h' ? value * 60 : value;
}

/**
 * Aggregate 1m base candles into `targetInterval`. Returns ok:false (never a
 * fabricated series) when the target is unsupported or the base bars are
 * inconsistent, so the caller can fall back to a native provider fetch.
 */
export function aggregateCandles(base: Candle[], targetInterval: string): AggregationResult {
  const minutes = parseIntervalMinutes(targetInterval);
  if (minutes === null) {
    return { ok: false, candles: [], reason: `unsupported interval: ${targetInterval}` };
  }
  if (minutes <= 1) {
    return { ok: true, candles: base }; // nothing to derive
  }
  if (base.length === 0) {
    return { ok: false, candles: [], reason: 'no base candles' };
  }

  // Reject duplicated or out-of-order base bars (gaps from closed sessions are
  // normal and allowed). Deriving from inconsistent bars would fabricate OHLCV.
  for (let i = 1; i < base.length; i++) {
    if (base[i].time <= base[i - 1].time) {
      return { ok: false, candles: [], reason: 'base candles duplicated or out of order' };
    }
  }

  const bucketSeconds = minutes * 60;
  const groups = new Map<number, Candle[]>();
  for (const candle of base) {
    const bucket = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    let chunk = groups.get(bucket);
    if (!chunk) {
      chunk = [];
      groups.set(bucket, chunk);
    }
    chunk.push(candle);
  }

  const out: Candle[] = [];
  for (const [time, chunk] of groups) {
    // chunk preserves ascending input order: first = open, last = close.
    let high = chunk[0].high;
    let low = chunk[0].low;
    let volume = 0;
    for (const c of chunk) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume;
    }
    out.push({
      time,
      open: chunk[0].open,
      high,
      low,
      close: chunk[chunk.length - 1].close,
      volume,
    });
  }
  // Map preserves insertion order (ascending base → ascending buckets); sort is
  // a cheap safeguard.
  out.sort((a, b) => a.time - b.time);
  return { ok: true, candles: out };
}
