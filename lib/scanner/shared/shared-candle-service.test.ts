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
  };
});

import {
  SharedCandleService,
  NegativeCacheError,
  storageKeysFor,
} from './shared-candle-service';
import { buildAcquisitionKey } from './acquisition-key';

const SAMPLE = [
  { time: 1_700_000_000, open: 10, high: 11, low: 9, close: 10.5, volume: 100 },
  { time: 1_700_000_600, open: 10.5, high: 12, low: 10, close: 11.8, volume: 120 },
  { time: 1_700_001_200, open: 11.8, high: 12.5, low: 11.5, close: 12.2, volume: 90 },
];

const T = 1_700_001_500_000; // fixed freshness clock (ms)

// Small single-flight timings keep waiter tests fast.
const FAST = { lockPollMs: 5, lockWaitMs: 1000, lockTtlMs: 1000, negativeCacheTtlMs: 1000 };

const okFetch = () => vi.fn(async (): Promise<FetchResult> => ({ candles: SAMPLE, provider: 'FakeProv' }));

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
      expect(r.provider).toBe('FakeProv');
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
      return { candles: SAMPLE, provider: 'FakeProv' };
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

describe('SharedCandleService.buildRequest — provider-aware canonicalization', () => {
  it('collapses equivalent futures notations to one acquisition key', () => {
    // getActiveProvider is mocked to "FakeProv" (root symbology via the default
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
