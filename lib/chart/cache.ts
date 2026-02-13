import { openDB } from 'idb';
import type { OHLCCandle, CachedChartData } from './types';

const DB_NAME = 'tradingdiary-charts';
const STORE_NAME = 'ohlc';

async function getChartDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME);
    },
  });
}

function cacheKey(symbol: string, date: string, interval: string): string {
  return `${symbol}|${date}|${interval}`;
}

export async function getCachedCandles(
  symbol: string,
  date: string,
  interval: string
): Promise<OHLCCandle[] | null> {
  const db = await getChartDB();
  const data = await db.get(STORE_NAME, cacheKey(symbol, date, interval)) as CachedChartData | undefined;
  if (data) return data.candles;
  return null;
}

export async function setCachedCandles(
  symbol: string,
  date: string,
  interval: string,
  candles: OHLCCandle[]
): Promise<void> {
  const db = await getChartDB();
  const record: CachedChartData = {
    symbol,
    date,
    interval,
    candles,
    fetchedAt: Date.now(),
  };
  await db.put(STORE_NAME, record, cacheKey(symbol, date, interval));
}
