import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MarketDataRequest } from './acquisition-key';
import type { CacheStore } from './cache-store';
import type { FetchResult } from '@/lib/scanner/candles';

// Model production accounting: getActiveProvider returns a trackProvider-wrapped
// provider that records exactly one request per fetchRecentCandles call. We mock
// the provider module so the fake provider records through a spy, letting us
// assert cache hits record zero requests and misses record exactly one.
const { recordSpy, providerFetch } = vi.hoisted(() => ({
  recordSpy: vi.fn(),
  providerFetch: vi.fn(),
}));

vi.mock('@/lib/metrics/provider-usage', () => ({
  recordProviderRequest: recordSpy,
}));

vi.mock('@/lib/chart/providers', () => ({
  getActiveProvider: () => ({
    name: 'FakeProv',
    fetchRecentCandles: async (symbol: string, interval: string) => {
      recordSpy('FakeProv', 'owner');
      return providerFetch(symbol, interval);
    },
    fetchCandles: async () => {
      recordSpy('FakeProv', 'owner');
      return providerFetch();
    },
  }),
}));

import { SharedCandleService } from './shared-candle-service';

const SAMPLE = [
  { time: 1_700_000_000, open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
  { time: 1_700_000_600, open: 10.5, high: 12, low: 10, close: 11.8, volume: 120 },
  { time: 1_700_001_200, open: 11.8, high: 12.5, low: 11.5, close: 12.2, volume: 90 },
];

const T = 1_700_001_500_000; // fixed clock (ms)

// In-memory CacheStore honoring PX expiry against an injectable clock.
class MemoryStore implements CacheStore {
  private map = new Map<string, { value: string; expiresAt: number }>();
  constructor(private now: () => number) {}
  async get(key: string): Promise<string | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.map.set(key, { value, expiresAt: this.now() + ttlMs });
  }
}

const request = (over: Partial<MarketDataRequest> = {}): MarketDataRequest => ({
  providerScope: 'fakeprov:server',
  canonicalSymbol: 'AAPL',
  interval: '10m',
  fetchScope: 'recent:ext',
  timeBucket: 28_333_358,
  ...over,
});

beforeEach(() => {
  recordSpy.mockClear();
  providerFetch.mockReset();
  providerFetch.mockResolvedValue(SAMPLE);
});

describe('SharedCandleService — request coalescing', () => {
  it('collapses five concurrent equivalent fetches to one upstream call', async () => {
    const store = new MemoryStore(() => T);
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({ candles: SAMPLE, provider: 'FakeProv' }));
    const svc = new SharedCandleService({ store, fetchFn, now: () => T });

    const results = await Promise.all(Array.from({ length: 5 }, () => svc.getCandles(request())));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    // All five callers receive the same candles from the single fetch.
    for (const r of results) {
      expect(r.candles).toHaveLength(SAMPLE.length);
      expect(r.provider).toBe('FakeProv');
    }
  });

  it('does not collapse requests that differ by interval', async () => {
    const store = new MemoryStore(() => T);
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({ candles: SAMPLE, provider: 'FakeProv' }));
    const svc = new SharedCandleService({ store, fetchFn, now: () => T });

    await Promise.all([
      svc.getCandles(request({ interval: '1m' })),
      svc.getCandles(request({ interval: '10m' })),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('SharedCandleService — cache hits and provider accounting', () => {
  it('serves a warm snapshot without fetching again', async () => {
    const store = new MemoryStore(() => T);
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({ candles: SAMPLE, provider: 'FakeProv' }));
    const svc = new SharedCandleService({ store, fetchFn, now: () => T });

    const miss = await svc.getCandles(request());
    expect(miss.cacheHit).toBe(false);

    const hit = await svc.getCandles(request());
    expect(hit.cacheHit).toBe(true);
    expect(hit.candles).toHaveLength(SAMPLE.length);
    expect(fetchFn).toHaveBeenCalledTimes(1); // no second upstream fetch
  });

  it('records exactly one provider request on a miss and zero on a hit', async () => {
    const store = new MemoryStore(() => T);
    // Default fetchFn: exercises the real fetchCandles → getActiveProvider path,
    // which records through the (mocked) recordProviderRequest.
    const svc = new SharedCandleService({ store, now: () => T });

    await svc.getCandles(request());
    expect(recordSpy).toHaveBeenCalledTimes(1); // miss => exactly one upstream request

    await svc.getCandles(request());
    expect(recordSpy).toHaveBeenCalledTimes(1); // hit => zero additional requests
  });

  it('records exactly one provider request for five concurrent misses', async () => {
    const store = new MemoryStore(() => T);
    const svc = new SharedCandleService({ store, now: () => T });

    await Promise.all(Array.from({ length: 5 }, () => svc.getCandles(request())));

    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it('treats a snapshot older than the TTL as a miss (freshness guard)', async () => {
    let clock = T;
    const store = new MemoryStore(() => clock);
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({ candles: SAMPLE, provider: 'FakeProv' }));
    const svc = new SharedCandleService({
      store,
      fetchFn,
      now: () => clock,
      config: { snapshotTtlMs: 75_000 },
    });

    await svc.getCandles(request());
    clock += 76_000; // advance past TTL
    const second = await svc.getCandles(request({ timeBucket: 28_333_359 }));

    expect(second.cacheHit).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('SharedCandleService — propagates provider errors without caching', () => {
  it('rethrows and caches nothing on a provider failure', async () => {
    const store = new MemoryStore(() => T);
    const fetchFn = vi.fn(async (): Promise<FetchResult> => ({ candles: SAMPLE, provider: 'FakeProv' }));
    fetchFn.mockRejectedValueOnce(new Error('provider down'));
    const svc = new SharedCandleService({ store, fetchFn, now: () => T });

    await expect(svc.getCandles(request())).rejects.toThrow('provider down');
    // Nothing cached: the next request retries the provider (one upstream call).
    const retry = await svc.getCandles(request());
    expect(retry.cacheHit).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
