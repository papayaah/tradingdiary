import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MarketDataRequest } from './acquisition-key';
import type { CacheStore } from './cache-store';
import type { FetchResult } from '@/lib/scanner/candles';
import { MemoryCacheStore } from './memory-cache-store';

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

vi.mock('@/lib/chart/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/chart/providers')>();
  return {
    ...actual, // keep real isFuturesSymbol / futuresRoot for canonicalization
    getActiveProvider: () => ({
      name: 'Tiingo',
      fetchRecentCandles: async (symbol: string, interval: string) => {
        recordSpy('Tiingo', 'owner');
        return providerFetch(symbol, interval);
      },
      fetchCandles: async () => {
        recordSpy('Tiingo', 'owner');
        return providerFetch();
      },
    }),
  };
});

import {
  SharedCandleService,
  NegativeCacheError,
  QuotaExceededError,
  storageKeysFor,
} from './shared-candle-service';
import { buildAcquisitionKey } from './acquisition-key';
import { dayKey, readUsage } from './request-quota';

const SAMPLE = [
  { time: 1_700_000_000, open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
  { time: 1_700_000_600, open: 10.5, high: 12, low: 10, close: 11.8, volume: 120 },
  { time: 1_700_001_200, open: 11.8, high: 12.5, low: 11.5, close: 12.2, volume: 90 },
];

const T = 1_700_001_500_000; // fixed freshness clock (ms)

// Small single-flight timings keep waiter tests fast; most unit tests opt out of
// aggregation so they can exercise native exact-request behavior independently.
const FAST = {
  lockPollMs: 5,
  lockWaitMs: 1000,
  lockTtlMs: 1000,
  negativeCacheTtlMs: 1000,
  aggregationEnabled: false,
};

// Ascending, minute-aligned 1m candles for aggregation tests.
const T0_1M = 1_700_000_400; // a 10m boundary
const oneMinCandles = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    time: T0_1M + i * 60,
    open: 100 + i,
    high: 100 + i + 0.5,
    low: 100 + i - 0.5,
    close: 100 + i + 0.2,
    volume: 10 + i,
  }));

const okFetch = () => vi.fn(async (): Promise<FetchResult> => ({ candles: SAMPLE, provider: 'Tiingo' }));

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

describe('SharedCandleService — request coalescing (in-process)', () => {
  it('collapses five concurrent equivalent fetches to one upstream call', async () => {
    const store = new MemoryCacheStore(() => T);
    const fetchFn = okFetch();
    const svc = new SharedCandleService({ store, fetchFn, now: () => T, config: FAST });

    const results = await Promise.all(Array.from({ length: 5 }, () => svc.getCandles(request())));

    expect(fetchFn).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r.candles).toHaveLength(SAMPLE.length);
      expect(r.provider).toBe('Tiingo');
    }
  });

  it('does not collapse requests that differ by interval', async () => {
    const store = new MemoryCacheStore(() => T);
    const fetchFn = okFetch();
    const svc = new SharedCandleService({ store, fetchFn, now: () => T, config: FAST });

    await Promise.all([
      svc.getCandles(request({ interval: '1m' })),
      svc.getCandles(request({ interval: '10m' })),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('SharedCandleService — distributed single-flight (cross-process)', () => {
  it('collapses two independent workers (shared Redis) to one upstream call', async () => {
    // One shared store models one Redis; two services model two worker processes,
    // each with its own in-process inflight map — so only the Redis lock can
    // collapse them.
    const store = new MemoryCacheStore(() => T);
    const fetchFn = vi.fn(async (): Promise<FetchResult> => {
      await new Promise((r) => setTimeout(r, 15)); // keep the owner busy so the peer waits
      return { candles: SAMPLE, provider: 'Tiingo' };
    });
    const workerA = new SharedCandleService({ store, fetchFn, now: () => T, config: FAST });
    const workerB = new SharedCandleService({ store, fetchFn, now: () => T, config: FAST });

    const [a, b] = await Promise.all([
      workerA.getCandles(request()),
      workerB.getCandles(request()),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(1); // one owner fetched; the other waited
    expect(a.candles).toHaveLength(SAMPLE.length);
    expect(b.candles).toHaveLength(SAMPLE.length);
    // Exactly one of them performed the fetch (miss); the other was served the snapshot.
    expect([a.cacheHit, b.cacheHit].filter(Boolean)).toHaveLength(1);
  });

  it('a waiter takes over when the lock owner crashes (lock expires)', async () => {
    // Real clock so the seeded lock's short TTL actually expires.
    const store = new MemoryCacheStore();
    const req = request();
    const keys = storageKeysFor(buildAcquisitionKey(req));
    // A crashed owner holds the lock but never writes a snapshot or releases it;
    // its lock expires in ~40ms.
    await store.acquireLock(keys.lock, 'dead-owner', 40);

    const fetchFn = okFetch();
    const svc = new SharedCandleService({ store, fetchFn, config: { ...FAST, lockPollMs: 5 } });

    const res = await svc.getCandles(req);

    expect(res.candles).toHaveLength(SAMPLE.length);
    // The waiter fetched exactly once after taking over the expired lock; the
    // dead owner never fetched.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('SharedCandleService — cache hits and provider accounting', () => {
  it('serves a warm snapshot without fetching again', async () => {
    const store = new MemoryCacheStore(() => T);
    const fetchFn = okFetch();
    const svc = new SharedCandleService({ store, fetchFn, now: () => T, config: FAST });

    const miss = await svc.getCandles(request());
    expect(miss.cacheHit).toBe(false);

    const hit = await svc.getCandles(request());
    expect(hit.cacheHit).toBe(true);
    expect(hit.candles).toHaveLength(SAMPLE.length);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('records exactly one provider request on a miss and zero on a hit', async () => {
    const store = new MemoryCacheStore(() => T);
    const svc = new SharedCandleService({ store, now: () => T, config: FAST });

    await svc.getCandles(request());
    expect(recordSpy).toHaveBeenCalledTimes(1);

    await svc.getCandles(request());
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it('records exactly one provider request for five concurrent misses', async () => {
    const store = new MemoryCacheStore(() => T);
    const svc = new SharedCandleService({ store, now: () => T, config: FAST });

    await Promise.all(Array.from({ length: 5 }, () => svc.getCandles(request())));

    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it('does not serve a snapshot past its TTL', async () => {
    let clock = T;
    const store = new MemoryCacheStore(() => clock);
    const fetchFn = okFetch();
    const svc = new SharedCandleService({
      store,
      fetchFn,
      now: () => clock,
      config: { ...FAST, snapshotTtlMs: 75_000 },
    });

    await svc.getCandles(request());
    expect(fetchFn).toHaveBeenCalledTimes(1);

    clock += 76_000; // past the snapshot TTL
    const second = await svc.getCandles(request());
    expect(second.cacheHit).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('SharedCandleService — negative caching of provider failures', () => {
  it('negative-caches a failure and fails fast without re-fetching, then retries after the window', async () => {
    let clock = T;
    const store = new MemoryCacheStore(() => clock);
    const fetchFn = okFetch();
    fetchFn.mockRejectedValueOnce(new Error('provider down'));
    const svc = new SharedCandleService({
      store,
      fetchFn,
      now: () => clock,
      config: { ...FAST, negativeCacheTtlMs: 10_000 },
    });

    // Owner fetch fails: rethrown, negative-cached.
    await expect(svc.getCandles(request())).rejects.toThrow('provider down');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Within the window: fail fast, no new upstream request (no fan-out).
    await expect(svc.getCandles(request())).rejects.toBeInstanceOf(NegativeCacheError);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // After the window: the provider is retried (and now succeeds).
    clock += 11_000;
    const ok = await svc.getCandles(request());
    expect(ok.cacheHit).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('shares the negative cache across workers (one failure, no per-worker retry)', async () => {
    const store = new MemoryCacheStore(() => T);
    const failing = vi.fn(async (): Promise<FetchResult> => {
      throw new Error('provider down');
    });
    const workerA = new SharedCandleService({ store, fetchFn: failing, now: () => T, config: FAST });
    const workerB = new SharedCandleService({ store, fetchFn: failing, now: () => T, config: FAST });

    await expect(workerA.getCandles(request())).rejects.toThrow('provider down');
    // Worker B sees the negative cache and does not call the provider again.
    await expect(workerB.getCandles(request())).rejects.toBeInstanceOf(NegativeCacheError);
    expect(failing).toHaveBeenCalledTimes(1);
  });
});

describe('SharedCandleService — base-interval aggregation (Phase 4, flag-gated)', () => {
  it('fetches 1m once and derives the requested interval when enabled', async () => {
    const store = new MemoryCacheStore(() => T);
    const base = oneMinCandles(30);
    const fetchFn = vi.fn(async (_s: string, _i: string): Promise<FetchResult> => ({
      candles: base,
      provider: 'Tiingo',
    }));
    const svc = new SharedCandleService({
      store,
      fetchFn,
      now: () => T,
      config: { ...FAST, aggregationEnabled: true },
    });

    const res = await svc.getCandlesForWatch('AAPL', '10m', 'equity');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][1]).toBe('1m'); // fetched the base, not 10m
    expect(res.candles.length).toBe(3); // 30 x 1m -> 3 x 10m
    expect(res.candles.length).toBeLessThan(base.length);
  });

  it('shares one 1m fetch across a 1m watch and a 10m watch', async () => {
    const store = new MemoryCacheStore(() => T);
    const base = oneMinCandles(30);
    const fetchFn = vi.fn(async (_s: string, _i: string): Promise<FetchResult> => ({
      candles: base,
      provider: 'Tiingo',
    }));
    const svc = new SharedCandleService({
      store,
      fetchFn,
      now: () => T,
      config: { ...FAST, aggregationEnabled: true },
    });

    const [oneM, tenM] = await Promise.all([
      svc.getCandlesForWatch('AAPL', '1m', 'equity'),
      svc.getCandlesForWatch('AAPL', '10m', 'equity'),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(1); // both served from the one 1m fetch
    expect(oneM.candles.length).toBe(30); // 1m watch gets raw base
    expect(tenM.candles.length).toBe(3); // 10m watch gets derived
  });

  it('with the flag OFF, 1m and 10m are two separate native fetches', async () => {
    const store = new MemoryCacheStore(() => T);
    const fetchFn = vi.fn(async (_s: string, _i: string): Promise<FetchResult> => ({
      candles: oneMinCandles(30),
      provider: 'Tiingo',
    }));
    const svc = new SharedCandleService({ store, fetchFn, now: () => T, config: FAST });

    await Promise.all([
      svc.getCandlesForWatch('AAPL', '1m', 'equity'),
      svc.getCandlesForWatch('AAPL', '10m', 'equity'),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const intervals = fetchFn.mock.calls.map((c) => c[1]).sort();
    expect(intervals).toEqual(['10m', '1m']);
  });

  it('fails boundedly without a native quota-bypass when base bars are inconsistent', async () => {
    const store = new MemoryCacheStore(() => T);
    const bad = [...oneMinCandles(3)].reverse(); // out of order -> aggregation fails
    const fetchFn = vi.fn(async (_s: string, interval: string): Promise<FetchResult> => ({
      candles: interval === '1m' ? bad : oneMinCandles(30),
      provider: 'Tiingo',
    }));
    const svc = new SharedCandleService({
      store,
      fetchFn,
      now: () => T,
      config: { ...FAST, aggregationEnabled: true },
    });

    await expect(svc.getCandlesForWatch('AAPL', '10m', 'equity')).rejects.toThrow(
      'unable to derive 10m candles',
    );

    const intervals = fetchFn.mock.calls.map((c) => c[1]);
    expect(intervals).toEqual(['1m']);
  });
});

describe('SharedCandleService — governor cadence sizes the acquisition bucket (Phase 6)', () => {
  it('collapses fetches within one cadence window and refreshes after it', () => {
    let clock = 1_700_001_600_000; // aligned to both 60s and 300s boundaries
    const svc = new SharedCandleService({
      store: new MemoryCacheStore(() => clock),
      now: () => clock,
      config: FAST,
      cadenceProvider: () => 300, // 5-minute effective cadence
    });

    const k1 = buildAcquisitionKey(svc.buildRequest('AAPL', '10m', 'equity'));
    clock += 250_000; // +250s: still inside the 300s window
    expect(buildAcquisitionKey(svc.buildRequest('AAPL', '10m', 'equity'))).toBe(k1);
    clock += 100_000; // +350s total: crossed into the next window
    expect(buildAcquisitionKey(svc.buildRequest('AAPL', '10m', 'equity'))).not.toBe(k1);
  });

  it('without a cadence provider, the default bucket advances every minute', () => {
    let clock = 1_700_001_600_000;
    const svc = new SharedCandleService({
      store: new MemoryCacheStore(() => clock),
      now: () => clock,
      config: { ...FAST, acquisitionBucketMs: 60_000 },
    });
    const k1 = buildAcquisitionKey(svc.buildRequest('AAPL', '10m', 'equity'));
    clock += 250_000; // 4+ minutes later -> a new default bucket
    expect(buildAcquisitionKey(svc.buildRequest('AAPL', '10m', 'equity'))).not.toBe(k1);
  });
});

describe('SharedCandleService.buildRequest — provider-aware canonicalization', () => {
  it('collapses equivalent futures notations to one acquisition key', () => {
    // getActiveProvider is mocked to "Tiingo" (root symbology via the default
    // capability), so every notation reduces to the product root -> one key.
    const svc = new SharedCandleService({ store: new MemoryCacheStore(() => T), now: () => T, config: FAST });
    const keys = ['MNQU6', '/MNQ', 'MNQ=F', 'MNQ.C.0'].map((s) =>
      buildAcquisitionKey(svc.buildRequest(s, '10m', 'futures')),
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('keeps different intervals on distinct keys', () => {
    const svc = new SharedCandleService({ store: new MemoryCacheStore(() => T), now: () => T, config: FAST });
    const a = buildAcquisitionKey(svc.buildRequest('AAPL', '1m', 'equity'));
    const b = buildAcquisitionKey(svc.buildRequest('AAPL', '10m', 'equity'));
    expect(a).not.toBe(b);
  });
});

describe('SharedCandleService — cache-only read (evaluate/Scan Now)', () => {
  it('returns null and never fetches when nothing is cached', async () => {
    const store = new MemoryCacheStore(() => T);
    const fetchFn = okFetch();
    const svc = new SharedCandleService({ store, fetchFn, now: () => T, config: FAST });

    const res = await svc.getCachedCandlesForWatch('AAPL', '10m', 'equity');

    expect(res).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled(); // the whole point: zero upstream calls
  });

  it('serves the cached snapshot a prior scan populated, still without fetching', async () => {
    const store = new MemoryCacheStore(() => T);
    const fetchFn = okFetch();
    const svc = new SharedCandleService({ store, fetchFn, now: () => T, config: FAST });

    // A normal scan populates the shared cache (one upstream call).
    await svc.getCandlesForWatch('AAPL', '10m', 'equity');
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Scan Now then reads that snapshot without adding any call.
    const cached = await svc.getCachedCandlesForWatch('AAPL', '10m', 'equity');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(cached?.cacheHit).toBe(true);
    expect(cached?.candles).toHaveLength(SAMPLE.length);
  });

  it('serves the stable latest snapshot after the acquisition bucket rolls', async () => {
    let clock = T;
    const store = new MemoryCacheStore(() => clock);
    const fetchFn = okFetch();
    const svc = new SharedCandleService({
      store,
      fetchFn,
      now: () => clock,
      config: { ...FAST, acquisitionBucketMs: 60_000, snapshotTtlMs: 75_000 },
    });

    await svc.getCandlesForWatch('AAPL', '10m', 'equity');
    clock += 61_000;
    const cached = await svc.getCachedCandlesForWatch('AAPL', '10m', 'equity');

    expect(cached?.candles).toHaveLength(SAMPLE.length);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('SharedCandleService — physical-request quota gate', () => {
  const SCOPE = 'fakeprov:server'; // the scope the request() helper resolves to
  const OVER_CAP = '100000000'; // far above the default daily cap

  it('counts a real fetch in the scope quota counters', async () => {
    const store = new MemoryCacheStore(() => T);
    const svc = new SharedCandleService({
      store,
      fetchFn: okFetch(),
      now: () => T,
      config: { ...FAST, quotaEnabled: true, quotaEnforce: false },
    });

    await svc.getCandles(request());
    await new Promise((r) => setTimeout(r, 5)); // flush fire-and-forget recordRequest

    expect((await readUsage(store, SCOPE, T)).daily).toBe(1);
  });

  it('enforce mode refuses a fetch over the cap and never calls the provider', async () => {
    const store = new MemoryCacheStore(() => T);
    const fetchFn = okFetch();
    const svc = new SharedCandleService({
      store,
      fetchFn,
      now: () => T,
      config: { ...FAST, quotaEnabled: true, quotaEnforce: true },
    });
    await store.set(dayKey(SCOPE, T), OVER_CAP, 3_600_000);

    await expect(svc.getCandles(request())).rejects.toBeInstanceOf(QuotaExceededError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('observe mode allows the fetch over the cap (logs only)', async () => {
    const store = new MemoryCacheStore(() => T);
    const fetchFn = okFetch();
    const svc = new SharedCandleService({
      store,
      fetchFn,
      now: () => T,
      config: { ...FAST, quotaEnabled: true, quotaEnforce: false },
    });
    await store.set(dayKey(SCOPE, T), OVER_CAP, 3_600_000);

    const res = await svc.getCandles(request());
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(res.candles.length).toBeGreaterThan(0);
  });

  it('does not count or gate when quota is disabled', async () => {
    const store = new MemoryCacheStore(() => T);
    const svc = new SharedCandleService({
      store,
      fetchFn: okFetch(),
      now: () => T,
      config: { ...FAST, quotaEnabled: false, quotaEnforce: true },
    });
    await store.set(dayKey(SCOPE, T), OVER_CAP, 3_600_000);

    // Over cap, but quota disabled => fetch proceeds and nothing new is counted.
    const res = await svc.getCandles(request());
    expect(res.candles.length).toBeGreaterThan(0);
    expect((await readUsage(store, SCOPE, T)).daily).toBe(Number(OVER_CAP));
  });
});

describe('MemoryCacheStore — lock-token ownership (contract used by the service)', () => {
  it('acquires with NX, refuses while held, and releases only for the owning token', async () => {
    const store = new MemoryCacheStore(() => T);

    expect(await store.acquireLock('lock:a', 'token-1', 1000)).toBe(true);
    expect(await store.acquireLock('lock:a', 'token-2', 1000)).toBe(false); // held

    await store.releaseLock('lock:a', 'wrong-token'); // no-op
    expect(await store.acquireLock('lock:a', 'token-3', 1000)).toBe(false); // still held

    await store.releaseLock('lock:a', 'token-1'); // owner releases
    expect(await store.acquireLock('lock:a', 'token-4', 1000)).toBe(true); // now free
  });
});
