// Candle fetching + normalization for the scanner. Reuses the existing
// provider factory (which falls back to server env keys: POLYGON_API_KEY,
// DATABENTO_API_KEY, ...), so the worker shares one code path with the app.

import { getActiveProvider, effectiveProviderName } from '@/lib/chart/providers';
import type { Candle } from '@/lib/scanner/patterns';
import { scannerConfig } from '@/lib/scanner/env';
import type { AssetClass, WatchSession } from '@/lib/scanner/sessions';

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

/** YYYYMMDD for the current America/New_York trading date. */
export function newYorkTradingDate(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}${get('month')}${get('day')}`;
}

function newYorkCandleParts(timestampSeconds: number): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestampSeconds * 1000));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  return { weekday: get('weekday'), minutes: hour * 60 + Number(get('minute')) };
}

/** Keep only candles belonging to the watch's selected ET intraday session. */
export function filterCandlesForSession(
  candles: Candle[],
  session: WatchSession,
  assetClass: AssetClass,
): Candle[] {
  if (assetClass !== 'equity') return candles;
  const lower = session === 'rth' ? 9 * 60 + 30 : 4 * 60;
  const upper = session === 'rth' || session === 'pre' ? 16 * 60 : 20 * 60;
  return candles.filter((candle) => {
    const { weekday, minutes } = newYorkCandleParts(candle.time);
    return weekday !== 'Sat' && weekday !== 'Sun' && minutes >= lower && minutes < upper;
  });
}

/**
 * Fetch candles for scanner evaluation with a bounded timeout. Equities request
 * only today's New York trading date; futures and crypto retain their continuous
 * recent-window behavior.
 */
export async function fetchCandles(
  symbol: string,
  interval: string,
  assetClass: AssetClass = 'equity',
): Promise<FetchResult> {
  const provider = getActiveProvider(symbol, undefined, assetClass);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('provider fetch timeout')), scannerConfig.fetchTimeoutMs),
  );
  const request = assetClass === 'equity'
    ? provider.fetchCandles(symbol, newYorkTradingDate(), interval)
    : provider.fetchRecentCandles(symbol, interval);
  const raw = await Promise.race([request, timeout]);
  // Report the provider that actually served the bars (IBKR vs Yahoo), not the
  // fallback chain's own name.
  return { candles: sanitizeCandles(raw as Array<Partial<Candle>>), provider: effectiveProviderName(provider) };
}
