// Candle fetching + normalization for the scanner. Reuses the existing
// provider factory (which falls back to server env keys: POLYGON_API_KEY,
// DATABENTO_API_KEY, ...), so the worker shares one code path with the app.

import { getActiveProvider } from '@/lib/chart/providers';
import type { Candle } from '@/lib/scanner/patterns';
import { scannerConfig } from '@/lib/scanner/env';

/** A bounded, validated candle snapshot as persisted in server_watch_state. */
export interface CandleSnapshot {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Drop candles with any non-finite OHLC value; volume is optional. */
export function sanitizeCandles(raw: Array<Partial<Candle>>): Candle[] {
  const clean: Candle[] = [];
  for (const c of raw) {
    if (
      isFiniteNumber(c.time) &&
      isFiniteNumber(c.open) &&
      isFiniteNumber(c.high) &&
      isFiniteNumber(c.low) &&
      isFiniteNumber(c.close)
    ) {
      clean.push({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: isFiniteNumber(c.volume) ? c.volume : 0,
      });
    }
  }
  // Ascending by time.
  clean.sort((a, b) => a.time - b.time);
  return clean;
}

/** Keep only the last N candles for the persisted preview window. */
export function boundRecent(candles: Candle[]): CandleSnapshot[] {
  const tail = candles.slice(-scannerConfig.maxRecentCandles);
  return tail.map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }));
}

export interface FetchResult {
  candles: Candle[];
  provider: string;
}

/** Fetch recent candles for a symbol/interval with a bounded timeout. */
export async function fetchCandles(symbol: string, interval: string): Promise<FetchResult> {
  const provider = getActiveProvider(symbol);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('provider fetch timeout')), scannerConfig.fetchTimeoutMs),
  );
  const raw = await Promise.race([provider.fetchRecentCandles(symbol, interval), timeout]);
  return { candles: sanitizeCandles(raw as Array<Partial<Candle>>), provider: provider.name };
}
