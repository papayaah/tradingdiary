// SharedCandleService — Phases 1 & 2 of shared-market-data-scanning.
//
// Wraps the provider layer so that N watches (across any number of users or
// devices) needing the same (providerScope, symbol, interval, fetchScope,
// timeBucket) cause AT MOST ONE upstream provider call per acquisition bucket.
// It owns cache lookup/TTL, request coalescing, distributed single-flight,
// negative caching, sanitized bounded snapshots, and acquisition metrics. It does
// NOT own pattern detection, watch state, alerts, SSE, or push — those stay
// per-watch in the evaluator (worker.ts).
//
// Provider-usage accounting is preserved by construction: the only upstream call
// path is `fetchCandles`, which routes through `getActiveProvider`/`trackProvider`
// and records exactly one `provider_request_stats` request per invocation. Cache
// hits, coalesced waiters, single-flight waiters, and negative-cache hits never
// call `fetchCandles`, so they record zero requests; a miss calls it once.
//
// Concurrency collapse happens at two levels:
//   - In-process: concurrent getCandles for one key await a single shared promise
//     (Phase 1), so a worker attempts the lock/fetch once per key.
//   - Cross-process: a token-owned Redis lock (Phase 2) elects one owner across
//     worker processes; the rest wait for the snapshot with jittered backoff, and
//     take over only if the owner's lock expires (crash recovery).
//
// On a provider error the owner writes a short negative-cache record and rethrows;
// affected watches then get an error/retry outcome WITHOUT each re-hitting the
// provider. Snapshots and negative-cache records are per acquisition key, so one
// key's failure never poisons another scope/symbol/interval.

import { createHash, randomUUID } from 'node:crypto';
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

/** Error thrown when a fresh negative-cache record is present for the key. */
export class NegativeCacheError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NegativeCacheError';
  }
}

/** Error thrown when a waiter never obtained a snapshot within the wait budget. */
export class SingleFlightTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SingleFlightTimeoutError';
  }
}

interface ServiceConfig {
  acquisitionBucketMs: number;
  snapshotTtlMs: number;
  maxSnapshotCandles: number;
  lockTtlMs: number;
  lockWaitMs: number;
  lockPollMs: number;
  negativeCacheTtlMs: number;
}

interface ServiceDeps {
  store?: CacheStore;
  fetchFn?: (symbol: string, interval: string) => Promise<FetchResult>;
  now?: () => number;
  config?: Partial<ServiceConfig>;
}

interface StorageKeys {
  snapshot: string;
  lock: string;
  error: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Fixed-length, credential-free Redis keys derived from the acquisition key. */
export function storageKeysFor(acquisitionKey: string): StorageKeys {
  const hash = createHash('sha256').update(acquisitionKey).digest('hex').slice(0, 32);
  return {
    snapshot: `market-data:snapshot:${hash}`,
    lock: `market-data:lock:${hash}`,
    error: `market-data:error:${hash}`,
  };
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
  // await one shared promise, so only its leader runs the cross-process protocol.
  private readonly inflight = new Map<string, Promise<AcquireResult>>();

  constructor(deps: ServiceDeps = {}) {
    this.store = deps.store ?? getSharedCacheStore();
    this.fetchFn = deps.fetchFn ?? defaultFetchCandles;
    this.now = deps.now ?? (() => Date.now());
    this.config = {
      acquisitionBucketMs: deps.config?.acquisitionBucketMs ?? scannerConfig.acquisitionBucketMs,
      snapshotTtlMs: deps.config?.snapshotTtlMs ?? scannerConfig.snapshotTtlMs,
      maxSnapshotCandles: deps.config?.maxSnapshotCandles ?? scannerConfig.maxSnapshotCandles,
      lockTtlMs: deps.config?.lockTtlMs ?? scannerConfig.lockTtlMs,
      lockWaitMs: deps.config?.lockWaitMs ?? scannerConfig.lockWaitMs,
      lockPollMs: deps.config?.lockPollMs ?? scannerConfig.lockPollMs,
      negativeCacheTtlMs: deps.config?.negativeCacheTtlMs ?? scannerConfig.negativeCacheTtlMs,
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

  /** Acquire candles for a watch's symbol/interval. Convenience wrapper over getCandles. */
  getCandlesForWatch(symbol: string, interval: string): Promise<AcquireResult> {
    return this.getCandles(this.buildRequest(symbol, interval));
  }

  /**
   * Return candles for a canonical request. Serves a fresh cached snapshot
   * without calling the provider; otherwise elects one owner (across processes)
   * to fetch once, caches a sanitized bounded snapshot, and shares it. Concurrent
   * equivalent calls coalesce. Provider errors are negative-cached briefly and
   * rethrown (never cached as data).
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
    const keys = storageKeysFor(acquisitionKey);

    // 1. Fresh snapshot already present?
    const cached = await this.readFreshSnapshot(keys.snapshot);
    if (cached) return this.hitResult(cached, acquisitionKey);

    // 2. Recent provider failure for this exact key? Fail fast without fetching.
    const negative = await this.readNegativeCache(keys.error);
    if (negative) throw new NegativeCacheError(negative);

    // 3. Distributed single-flight: try to become the owner.
    const token = randomUUID();
    let acquired: boolean;
    try {
      acquired = await this.store.acquireLock(keys.lock, token, this.config.lockTtlMs);
    } catch {
      // Redis lock unavailable: degrade to a direct fetch (still bounded by the
      // worker rate limiter). Snapshots are disposable; correctness is preserved.
      return this.fetchAndStore(request, keys, acquisitionKey, null);
    }

    if (acquired) return this.fetchAndStore(request, keys, acquisitionKey, { key: keys.lock, token });

    // 4. Someone else owns the lock: wait for their snapshot, or take over if the
    //    owner crashed (lock expired).
    return this.waitForOwner(request, keys, acquisitionKey);
  }

  /**
   * Owner (or degraded-direct) path: perform the single upstream fetch, cache the
   * snapshot on success, negative-cache on failure, and always release the lock.
   */
  private async fetchAndStore(
    request: MarketDataRequest,
    keys: StorageKeys,
    acquisitionKey: string,
    lock: { key: string; token: string } | null,
  ): Promise<AcquireResult> {
    try {
      // The one upstream request (records exactly one provider request).
      const result = await this.fetchFn(request.canonicalSymbol, request.interval);
      await this.writeSnapshot(keys.snapshot, request, result);
      return {
        candles: result.candles,
        provider: result.provider,
        cacheHit: false,
        acquisitionKey,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'provider fetch failed';
      await this.writeNegativeCache(keys.error, message);
      throw err;
    } finally {
      if (lock) {
        try {
          await this.store.releaseLock(lock.key, lock.token);
        } catch {
          // Best-effort: the lock's TTL will expire it anyway.
        }
      }
    }
  }

  /**
   * Waiter path: poll for the owner's snapshot with jittered backoff. Returns the
   * snapshot as a cache hit as soon as it appears; surfaces the owner's failure
   * via the negative cache; takes over as owner if the lock expires (crash);
   * throws if the wait budget is exhausted (BullMQ then retries the job).
   */
  private async waitForOwner(
    request: MarketDataRequest,
    keys: StorageKeys,
    acquisitionKey: string,
  ): Promise<AcquireResult> {
    // Wall-clock budget (real timers), independent of the injected freshness clock.
    const deadline = Date.now() + this.config.lockWaitMs;

    while (Date.now() < deadline) {
      await sleep(this.jitteredPoll());

      const snapshot = await this.readFreshSnapshot(keys.snapshot);
      if (snapshot) return this.hitResult(snapshot, acquisitionKey);

      const negative = await this.readNegativeCache(keys.error);
      if (negative) throw new NegativeCacheError(negative);

      // No snapshot and no error record yet: the owner may have crashed. Try to
      // take the (now possibly expired) lock and become the owner ourselves.
      const token = randomUUID();
      let took = false;
      try {
        took = await this.store.acquireLock(keys.lock, token, this.config.lockTtlMs);
      } catch {
        took = false;
      }
      if (took) return this.fetchAndStore(request, keys, acquisitionKey, { key: keys.lock, token });
    }

    throw new SingleFlightTimeoutError(
      `timed out waiting for a shared snapshot after ${this.config.lockWaitMs}ms`,
    );
  }

  private jitteredPoll(): number {
    const base = this.config.lockPollMs;
    // Full jitter in [base/2, 1.5*base) to spread waiter wakeups.
    return Math.floor(base / 2 + Math.random() * base);
  }

  private async writeSnapshot(
    storageKey: string,
    request: MarketDataRequest,
    result: FetchResult,
  ): Promise<void> {
    const snapshot: SharedCandleSnapshot = {
      provider: result.provider,
      canonicalSymbol: request.canonicalSymbol,
      interval: request.interval,
      fetchedAt: new Date(this.now()).toISOString(),
      sourceTimeBucket: request.timeBucket,
      candles: this.boundSnapshot(result.candles),
    };
    try {
      await this.store.set(storageKey, JSON.stringify(snapshot), this.config.snapshotTtlMs);
    } catch {
      // Disposable: worst case the next equivalent request fetches again.
    }
  }

  private async writeNegativeCache(errorKey: string, message: string): Promise<void> {
    const record = JSON.stringify({ message, at: new Date(this.now()).toISOString() });
    try {
      await this.store.set(errorKey, record, this.config.negativeCacheTtlMs);
    } catch {
      // Best-effort; absence just means the next request retries the provider.
    }
  }

  private async readNegativeCache(errorKey: string): Promise<string | null> {
    let raw: string | null;
    try {
      raw = await this.store.get(errorKey);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { message?: string };
      return `provider recently failed for this request: ${parsed.message ?? 'unknown error'}`;
    } catch {
      return 'provider recently failed for this request';
    }
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
    // sufficient metadata). Reject anything older than one TTL as a guard.
    const fetchedAtMs = Date.parse(snapshot.fetchedAt);
    if (Number.isNaN(fetchedAtMs)) return null;
    if (this.now() - fetchedAtMs > this.config.snapshotTtlMs) return null;

    return snapshot;
  }

  private hitResult(snapshot: SharedCandleSnapshot, acquisitionKey: string): AcquireResult {
    return {
      candles: snapshot.candles.map(toCandle),
      provider: snapshot.provider,
      cacheHit: true,
      acquisitionKey,
    };
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
