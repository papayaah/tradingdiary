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
import type { AssetClass } from '@/lib/scanner/sessions';
import {
  buildAcquisitionKey,
  currentTimeBucket,
  type MarketDataRequest,
} from './acquisition-key';
import { resolveProviderIdentity } from './provider-scope';
import { getProviderCapability, type ProviderCapability } from './provider-capabilities';
import { buildFetchScope, canonicalizeSymbol, classifyAssetClass } from './canonical-symbol';
import { aggregateCandles, parseIntervalMinutes, BASE_INTERVAL } from './aggregate';
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
  aggregationEnabled: boolean;
}

/** Shared acquisition context for a watch's symbol (provider-resolved once). */
interface RequestContext {
  providerScope: string;
  canonicalSymbol: string;
  fetchScope: string;
  capability: ProviderCapability;
}

interface ServiceDeps {
  store?: CacheStore;
  fetchFn?: (symbol: string, interval: string, assetClass?: AssetClass) => Promise<FetchResult>;
  now?: () => number;
  config?: Partial<ServiceConfig>;
  /**
   * Optional per-scope acquisition cadence (seconds), from the Phase 6 governor.
   * When set, it sizes the acquisition bucket and snapshot TTL per provider scope
   * so a symbol refreshes at most once per cadence window. When absent (default),
   * the fixed acquisitionBucketMs is used and behavior is unchanged.
   */
  cadenceProvider?: (providerScope: string) => number;
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
  private readonly fetchFn: (symbol: string, interval: string, assetClass?: AssetClass) => Promise<FetchResult>;
  private readonly now: () => number;
  private readonly config: ServiceConfig;
  private cadenceProvider?: (providerScope: string) => number;

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
      aggregationEnabled: deps.config?.aggregationEnabled ?? scannerConfig.aggregationEnabled,
    };
    this.cadenceProvider = deps.cadenceProvider;
  }

  /** Install (or replace) the governor's per-scope cadence provider at runtime. */
  setCadenceProvider(provider: (providerScope: string) => number): void {
    this.cadenceProvider = provider;
  }

  /**
   * Acquisition bucket length (ms) for a scope. With a governor installed this is
   * the effective cadence; otherwise the fixed configured bucket. It sizes both
   * the time bucket (how often a new fetch happens) and the snapshot TTL (how
   * long a snapshot stays serveable) so they always agree.
   */
  private bucketMsFor(providerScope: string): number {
    if (this.cadenceProvider) {
      const seconds = this.cadenceProvider(providerScope);
      if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
    }
    return this.config.acquisitionBucketMs;
  }

  /** Snapshot TTL (ms) for a scope: never shorter than the cadence window. */
  private snapshotTtlMsFor(providerScope: string): number {
    return Math.max(this.config.snapshotTtlMs, this.bucketMsFor(providerScope));
  }

  /**
   * Resolve the provider-aware acquisition context for a symbol (Phase 3):
   * provider scope, canonical symbol, fetch scope, and capabilities. No upstream
   * request is triggered.
   */
  private resolveContext(symbol: string, assetClass: AssetClass): RequestContext {
    const { providerName, providerScope } = resolveProviderIdentity(symbol, assetClass);
    const capability = getProviderCapability(providerName, assetClass);
    return {
      providerScope,
      canonicalSymbol: canonicalizeSymbol(symbol, assetClass, capability),
      fetchScope: buildFetchScope(capability),
      capability,
    };
  }

  private requestFor(ctx: RequestContext, interval: string): MarketDataRequest {
    return {
      providerScope: ctx.providerScope,
      canonicalSymbol: ctx.canonicalSymbol,
      interval,
      fetchScope: ctx.fetchScope,
      timeBucket: currentTimeBucket(this.now(), this.bucketMsFor(ctx.providerScope)),
    };
  }

  /**
   * Build the canonical (native) request for a watch's symbol/interval at the
   * current bucket. `assetClass` should come from the watch; without it, it is
   * inferred from the symbol.
   */
  buildRequest(
    symbol: string,
    interval: string,
    assetClass: AssetClass = classifyAssetClass(symbol),
  ): MarketDataRequest {
    return this.requestFor(this.resolveContext(symbol, assetClass), interval);
  }

  /**
   * Acquire candles for a watch's symbol/interval.
   *
   * When aggregation is enabled and the provider supports it, a single shared 1m
   * snapshot is fetched and the requested interval is DERIVED from it — so every
   * higher interval of a symbol collapses onto one upstream 1m request. If the
   * base bars are inconsistent, it falls back to a native fetch of the requested
   * interval. With aggregation off (the default), it fetches natively as before.
   */
  async getCandlesForWatch(
    symbol: string,
    interval: string,
    assetClass: AssetClass = classifyAssetClass(symbol),
  ): Promise<AcquireResult> {
    const ctx = this.resolveContext(symbol, assetClass);
    const minutes = parseIntervalMinutes(interval);
    const canAggregate =
      this.config.aggregationEnabled &&
      ctx.capability.aggregatableFrom1m &&
      minutes !== null &&
      minutes > 1;

    if (canAggregate) {
      const base = await this.getCandles(this.requestFor(ctx, BASE_INTERVAL), assetClass);
      const derived = aggregateCandles(base.candles, interval);
      if (derived.ok && derived.candles.length > 0) {
        // Reuse the base snapshot's provenance; only the candle array is derived.
        return { ...base, candles: derived.candles };
      }
      // Inconsistent/insufficient base bars: fall back to a native fetch.
    }

    return this.getCandles(this.requestFor(ctx, interval), assetClass);
  }

  /**
   * Return candles for a canonical request. Serves a fresh cached snapshot
   * without calling the provider; otherwise elects one owner (across processes)
   * to fetch once, caches a sanitized bounded snapshot, and shares it. Concurrent
   * equivalent calls coalesce. Provider errors are negative-cached briefly and
   * rethrown (never cached as data).
   */
  getCandles(request: MarketDataRequest, assetClass: AssetClass = 'equity'): Promise<AcquireResult> {
    const acquisitionKey = buildAcquisitionKey(request);

    // Synchronous check-then-set (no await between) makes coalescing race-free
    // within a single-threaded event loop.
    const existing = this.inflight.get(acquisitionKey);
    if (existing) return existing;

    const promise = this.acquire(request, acquisitionKey, assetClass);
    this.inflight.set(acquisitionKey, promise);
    return promise.finally(() => {
      this.inflight.delete(acquisitionKey);
    });
  }

  private emitMetric(metric: 'hits' | 'misses' | 'waiters' | 'upstream' | 'errors'): void {
    try {
      const d = new Date(this.now());
      const YYYYMMDDHH = d.toISOString().slice(0, 13).replace(/[-T]/g, '');
      const key = `metrics:cache:${YYYYMMDDHH}:${metric}`;
      if (typeof this.store.incr === 'function') {
        this.store.incr(key, 7 * 24 * 60 * 60 * 1000).catch(() => {});
      }
    } catch {
      // Fire-and-forget
    }
  }

  private async acquire(
    request: MarketDataRequest,
    acquisitionKey: string,
    assetClass: AssetClass,
  ): Promise<AcquireResult> {
    const keys = storageKeysFor(acquisitionKey);

    // 1. Fresh snapshot already present?
    const cached = await this.readFreshSnapshot(keys.snapshot, request.providerScope);
    if (cached) {
      this.emitMetric('hits');
      return this.hitResult(cached, acquisitionKey);
    }

    // 2. Recent provider failure for this exact key? Fail fast without fetching.
    const negative = await this.readNegativeCache(keys.error);
    if (negative) {
      this.emitMetric('errors');
      throw new NegativeCacheError(negative);
    }

    // 3. Distributed single-flight: try to become the owner.
    const token = randomUUID();
    let acquired: boolean;
    try {
      acquired = await this.store.acquireLock(keys.lock, token, this.config.lockTtlMs);
    } catch {
      // Redis lock unavailable: degrade to a direct fetch (still bounded by the
      // worker rate limiter). Snapshots are disposable; correctness is preserved.
      return this.fetchAndStore(request, keys, acquisitionKey, assetClass, null);
    }

    if (acquired) return this.fetchAndStore(request, keys, acquisitionKey, assetClass, { key: keys.lock, token });

    // 4. Someone else owns the lock: wait for their snapshot, or take over if the
    //    owner crashed (lock expired).
    this.emitMetric('waiters');
    return this.waitForOwner(request, keys, acquisitionKey, assetClass);
  }

  /**
   * Owner (or degraded-direct) path: perform the single upstream fetch, cache the
   * snapshot on success, negative-cache on failure, and always release the lock.
   */
  private async fetchAndStore(
    request: MarketDataRequest,
    keys: StorageKeys,
    acquisitionKey: string,
    assetClass: AssetClass,
    lock: { key: string; token: string } | null,
  ): Promise<AcquireResult> {
    try {
      // The one upstream request (records exactly one provider request).
      this.emitMetric('upstream');
      this.emitMetric('misses');
      const result = await this.fetchFn(request.canonicalSymbol, request.interval, assetClass);
      await this.writeSnapshot(keys.snapshot, request, result);
      return {
        candles: result.candles,
        provider: result.provider,
        cacheHit: false,
        acquisitionKey,
      };
    } catch (err) {
      this.emitMetric('errors');
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
    assetClass: AssetClass,
  ): Promise<AcquireResult> {
    // Wall-clock budget (real timers), independent of the injected freshness clock.
    const deadline = Date.now() + this.config.lockWaitMs;

    while (Date.now() < deadline) {
      await sleep(this.jitteredPoll());

      const snapshot = await this.readFreshSnapshot(keys.snapshot, request.providerScope);
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
      if (took) return this.fetchAndStore(request, keys, acquisitionKey, assetClass, { key: keys.lock, token });
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
      await this.store.set(
        storageKey,
        JSON.stringify(snapshot),
        this.snapshotTtlMsFor(request.providerScope),
      );
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

  private async readFreshSnapshot(
    storageKey: string,
    providerScope: string,
  ): Promise<SharedCandleSnapshot | null> {
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
    if (this.now() - fetchedAtMs > this.snapshotTtlMsFor(providerScope)) return null;

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
