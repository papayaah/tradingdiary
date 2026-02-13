import type { OHLCCandle } from './types';
import { getCachedCandles, setCachedCandles } from './cache';

export async function fetchCandles(
  symbol: string,
  date: string,
  interval: string = '5m'
): Promise<OHLCCandle[]> {
  // Check cache first
  const cached = await getCachedCandles(symbol, date, interval);
  if (cached && cached.length > 0) return cached;

  // Fetch from our proxy
  const params = new URLSearchParams({ symbol, date, interval });
  const res = await fetch(`/api/chart?${params}`);

  if (!res.ok) {
    throw new Error(`Chart data fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const candles: OHLCCandle[] = data.candles || [];

  // Cache for future use
  if (candles.length > 0) {
    await setCachedCandles(symbol, date, interval, candles);
  }

  return candles;
}
