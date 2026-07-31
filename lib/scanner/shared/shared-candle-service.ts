// SharedCandleService — Phase 1 of shared-market-data-scanning.
//
// Wraps the provider layer so that N watches (across any number of users or
// devices) needing the same (providerScope, symbol, interval, fetchScope,
// timeBucket) cause AT MOST ONE upstream provider call per acquisition bucket.
// It owns cache lookup/TTL, request coalescing, sanitized bounded snapshots, and
// acquisition metrics. It does NOT own pattern detection, watch state, alerts,
// SSE, or push — those stay per-watch in the evaluator (worker.ts).
//
// Provider-usage accounting is preserved by construction: the only upstream call
// path is `fetchCandles`, which routes through `getActiveProvider`/`trackProvider`
// and records exactly one `provider_request_stats` request per invocation. A
// cache hit and a coalesced waiter never call `fetchCandles`, so they record
// zero requests; a miss calls it once, so it records exactly one.
//
// Scope note: this phase deliberately excludes the Phase 2 distributed
// single-flight lock and negative caching. Concurrent equivalent misses within a
// single worker process are collapsed here by in-process promise coalescing —
// cross-process collapse (the Redis lock) is Phase 2. On a provider error the
// service does not cache anything; it rethrows so the worker records error state
// and BullMQ retries (which re-enters acquisition through this cache).

import { createHash } from 'node:crypto';
import type { Candle } from '@/lib/scanner/patterns';
import { fetchCandles as defaultFetchCandles, type FetchResult } from '@/lib/scanner/candles';
import { scannerConfig } from '@/lib/scanner/env';
import type { CandleSnapshot } from '@/lib/scanner/candles';
import {
  buildAcquisitionKey,
  currentTimeBucket,
  defaultFetchScope,
  canonicalSymbol as toCanonicalSymbol,
  type MarketDataRequest,
} from './acquisition-key';
import { resolveProviderScope } from './provider-scope';
import { getSharedCacheStore, type CacheStore } from './cache-store';

/** Bounded, disposable snapshot persisted in Redis (see spec). */
export interface SharedCandleSnapshot {
  provider: string;
  canonicalSymbol: string;
  interval: string;
  fetchedAt: string; // ISO — authoritative for freshness, not just Redis TTL
  sourceTimeBucket: number;
  candles: CandleSnapshot[];
}

export interface AcquireResult {
  candles: Candle[];
  provider: string;
  cacheHit: boolean;
  acquisitionKey: string;
}

interface ServiceConfig {
  acquisitionBucketMs: number;
  snapshotTtlMs: number;
  maxSnapshotCandles: number;
}

interface ServiceDeps {
  store?: CacheStore;
  fetchFn?: (symbol: string, interval: string) => Promise<FetchResult>;
  now?: () => number;
  config?: Partial<ServiceConfig>;
}

/** Fixed-length, credential-free Redis key derived from the acquisition key. */
function snapshotStorageKey(acquisitionKey: string): string {
  const hash = createHash('sha256').update(acquisitionKey).digest('hex').slice(0, 32);
  return `market-data:snapshot:${hash}`;
}

/** A CandleSnapshot (volume optional) → a full Candle (volume required). */
function toCandle(c: CandleSnapshot): Candle {
  return {
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: typeof c.volume === 'number' ? c.volume : 0,
  };
}

export class SharedCandleService {
  private readonly store: CacheStore;
  private readonly fetchFn: (symbol: string, interval: string) => Promise<FetchResult>;
  private readonly now: () => number;
  private readonly config: ServiceConfig;

  // In-process coalescing: concurrent getCandles for the same acquisition key
  // await one shared promise, so only its leader performs the fetch. This is the
  // Phase 1 mechanism that keeps five concurrent equivalent requests down to one
  // upstream call within a worker. (Cross-process single-flight is Phase 2.)
  private readonly inflight = new Map<string, Promise<AcquireResult>>();

  constructor(deps: ServiceDeps = {}) {
    this.store = deps.store ?? getSharedCacheStore();
    this.fetchFn = deps.fetchFn ?? defaultFetchCandles;
    this.now = deps.now ?? (() => Date.now());
    this.config = {
      acquisitionBucketMs: deps.config?.acquisitionBucketMs ?? scannerConfig.acquisitionBucketMs,
      snapshotTtlMs: deps.config?.snapshotTtlMs ?? scannerConfig.snapshotTtlMs,
      maxSnapshotCandles: deps.config?.maxSnapshotCandles ?? scannerConfig.maxSnapshotCandles,
    };
  }

  /** Build the canonical request for a watch's symbol/interval at the current bucket. */
  buildRequest(symbol: string, interval: string): MarketDataRequest {
    return {
      providerScope: resolveProviderScope(symbol),
      canonicalSymbol: toCanonicalSymbol(symbol),
      interval,
      fetchScope: defaultFetchScope(),
      timeBucket: currentTimeBucket(this.now(), this.config.acquisitionBucketMs),
    };
  }

  /**
   * Acquire candles for a watch's symbol/interval, shared across equivalent
   * requests. Convenience wrapper over {@link getCandles} for the worker.
   */
  getCandlesForWatch(symbol: string, interval: string): Promise<AcquireResult> {
    return this.getCandles(this.buildRequest(symbol, interval));
  }

  /**
   * Return candles for a canonical request. Serves a fresh cached snapshot
   * without calling the provider; otherwise fetches once, caches a sanitized
   * bounded snapshot, and returns it. Concurrent equivalent calls coalesce onto
   * one fetch. Provider errors are propagated (not cached) after the single
   * upstream request has been recorded.
   */
  getCandles(request: MarketDataRequest): Promise<AcquireResult> {
    const acquisitionKey = buildAcquisitionKey(request);

    // Synchronous check-then-set (no await between) makes coalescing race-free
    // within a single-threaded event loop.
    const existing = this.inflight.get(acquisitionKey);
    if (existing) return existing;

    const promise = this.acquire(request, acquisitionKey);
    this.inflight.set(acquisitionKey, promise);
    return promise.finally(() => {
      this.inflight.delete(acquisitionKey);
    });
  }

  private async acquire(request: MarketDataRequest, acquisitionKey: string): Promise<AcquireResult> {
    const storageKey = snapshotStorageKey(acquisitionKey);

    const cached = await this.readFreshSnapshot(storageKey);
    if (cached) {
      return {
        candles: cached.candles.map(toCandle),
        provider: cached.provider,
        cacheHit: true,
        acquisitionKey,
      };
    }

    // Cache miss: exactly one upstream request (records one provider request).
    const result = await this.fetchFn(request.canonicalSymbol, request.interval);

    const snapshot: SharedCandleSnapshot = {
      provider: result.provider,
      canonicalSymbol: request.canonicalSymbol,
      interval: request.interval,
      fetchedAt: new Date(this.now()).toISOString(),
      sourceTimeBucket: request.timeBucket,
      candles: this.boundSnapshot(result.candles),
    };

    // Best-effort write: a Redis write failure must not fail the scan — worst
    // case the next equivalent request fetches again.
    try {
      await this.store.set(storageKey, JSON.stringify(snapshot), this.config.snapshotTtlMs);
    } catch {
      // Snapshots are disposable; swallow and serve the freshly fetched data.
    }

    return {
      candles: result.candles,
      provider: result.provider,
      cacheHit: false,
      acquisitionKey,
    };
  }

  private async readFreshSnapshot(storageKey: string): Promise<SharedCandleSnapshot | null> {
    let raw: string | null;
    try {
      raw = await this.store.get(storageKey);
    } catch {
      return null; // Redis unavailable: fall through to a direct provider fetch.
    }
    if (!raw) return null;

    let snapshot: SharedCandleSnapshot;
    try {
      snapshot = JSON.parse(raw) as SharedCandleSnapshot;
    } catch {
      return null;
    }
    if (!Array.isArray(snapshot.candles)) return null;

    // fetchedAt is authoritative for freshness (Redis TTL alone is not
    // sufficient metadata). Reject anything older than one TTL as a guard even
    // if Redis returned it.
    const fetchedAtMs = Date.parse(snapshot.fetchedAt);
    if (Number.isNaN(fetchedAtMs)) return null;
    if (this.now() - fetchedAtMs > this.config.snapshotTtlMs) return null;

    return snapshot;
  }

  /** Cap snapshot length so a cached record stays bounded (see spec). */
  private boundSnapshot(candles: Candle[]): CandleSnapshot[] {
    const tail =
      candles.length > this.config.maxSnapshotCandles
        ? candles.slice(-this.config.maxSnapshotCandles)
        : candles;
    return tail.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }
}

let sharedService: SharedCandleService | null = null;

/** Process-wide SharedCandleService using the default Redis store and provider fetch. */
export function getSharedCandleService(): SharedCandleService {
  if (!sharedService) sharedService = new SharedCandleService();
  return sharedService;
}
