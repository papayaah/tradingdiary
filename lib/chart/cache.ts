import { openDB } from 'idb';
import type { OHLCCandle, CachedChartData } from './types';

const DB_NAME = 'tradingdiary-charts';
const STORE_NAME = 'ohlc';
// DB schema version. Bumped to 2 to heal databases that were created empty by a
// no-upgrade open() elsewhere: raising the version forces `upgrade` to run on
// existing v1 databases so the missing `ohlc` store gets created. The upgrade
// is idempotent, so it is safe whether or not the store already exists.
const DB_VERSION = 2;
// Bump this when the candle fetch logic changes to invalidate stale cache entries
const CACHE_VERSION = 2;

/**
 * The single opener for the chart cache database. All callers (chart fetch and
 * the watch page's live cache) must go through this so the name, version, and
 * store definition never diverge — divergence is what left the store missing.
 */
export async function getChartDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

function cacheKey(symbol: string, date: string, interval: string): string {
  return `v${CACHE_VERSION}|${symbol}|${date}|${interval}`;
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
