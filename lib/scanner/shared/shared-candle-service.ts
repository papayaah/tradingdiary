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
import { getProviderBudget } from './provider-budget';
import { recordRequest, reserveRequest } from './request-quota';

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

/** Error thrown when the physical-request quota gate refuses a fetch (enforce mode). */
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
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
  quotaEnabled: boolean;
  quotaEnforce: boolean;
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
  latest: string;
  lock: string;
  error: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Fixed-length, credential-free Redis keys derived from the acquisition key. */
export function storageKeysFor(acquisitionKey: string): StorageKeys {
  const hash = createHash('sha256').update(acquisitionKey).digest('hex').slice(0, 32);
  const bucketSeparator = acquisitionKey.lastIndexOf(':');
  const stableSeriesKey = bucketSeparator >= 0
    ? acquisitionKey.slice(0, bucketSeparator)
    : acquisitionKey;
  return {
    snapshot: `market-data:snapshot:${hash}`,
    latest: `market-data:latest:${createHash('sha256')
      .update(stableSeriesKey)
      .digest('hex')
      .slice(0, 32)}`,
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
  private readonly quotaAtProviderBoundary: boolean;
  private cadenceProvider?: (providerScope: string) => number;

  // In-process coalescing: concurrent getCandles for the same acquisition key
  // await one shared promise, so only its leader runs the cross-process protocol.
  private readonly inflight = new Map<string, Promise<AcquireResult>>();

  constructor(deps: ServiceDeps = {}) {
    this.store = deps.store ?? getSharedCacheStore();
    this.fetchFn = deps.fetchFn ?? defaultFetchCandles;
    this.quotaAtProviderBoundary = !deps.fetchFn;
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
      quotaEnabled: deps.config?.quotaEnabled ?? scannerConfig.quotaEnabled,
      quotaEnforce: deps.config?.quotaEnforce ?? scannerConfig.quotaEnforce,
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
  private snapshotTtlMsFor(providerScope: string, interval?: string): number {
    const dailyFloor = interval?.toLowerCase() === '1d' || interval?.toLowerCase() === 'd'
      ? 7 * 60 * 60 * 1000
      : 0;
    return Math.max(this.config.snapshotTtlMs, this.bucketMsFor(providerScope), dailyFloor);
  }

  private latestSnapshotTtlMsFor(providerScope: string, interval?: string): number {
    return Math.max(
      this.snapshotTtlMsFor(providerScope, interval),
      this.bucketMsFor(providerScope) * 3,
    );
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
      // Never silently bypass the one-base-series budget with a native fetch.
      throw new Error(`unable to derive ${interval} candles from the shared 1m series: ${derived.reason}`);
    }

    return this.getCandles(this.requestFor(ctx, interval), assetClass);
  }

  /**
   * Cache-ONLY variant of getCandlesForWatch for manual/evaluate scans: return
   * the freshest shared snapshot if one exists, deriving from the 1m base when
   * aggregation applies, but NEVER acquire a lock or call the provider. Returns
   * null when nothing usable is cached, so the caller can decide what to do
   * without any upstream request. This is the choke point that makes Scan Now
   * free: it reads, it never fetches.
   */
  async getCachedCandlesForWatch(
    symbol: string,
    interval: string,
    assetClass: AssetClass = classifyAssetClass(symbol),
  ): Promise<AcquireResult | null> {
    const ctx = this.resolveContext(symbol, assetClass);
    const minutes = parseIntervalMinutes(interval);
    const canAggregate =
      this.config.aggregationEnabled &&
      ctx.capability.aggregatableFrom1m &&
      minutes !== null &&
      minutes > 1;

    if (canAggregate) {
      const base = await this.readLatestSnapshotOnly(this.requestFor(ctx, BASE_INTERVAL));
      if (!base) return null;
      const derived = aggregateCandles(base.candles, interval);
      if (derived.ok && derived.candles.length > 0) {
        return { ...base, candles: derived.candles };
      }
      return null; // no native fallback in cache-only mode — that would fetch
    }

    return this.readLatestSnapshotOnly(this.requestFor(ctx, interval));
  }

  /**
   * Read a canonical request's snapshot from the store without locking, fetching,
   * or negative-caching. Returns null on a miss. Used only by the cache-only path.
   */
  private async readSnapshotOnly(request: MarketDataRequest): Promise<AcquireResult | null> {
    const acquisitionKey = buildAcquisitionKey(request);
    const keys = storageKeysFor(acquisitionKey);
    const snapshot = await this.readFreshSnapshot(keys.snapshot, request.providerScope, request.interval);
    if (!snapshot) return null;
    this.emitMetric('hits');
    return this.hitResult(snapshot, acquisitionKey);
  }

  /** Read the provider-owned latest series independent of acquisition buckets. */
  private async readLatestSnapshotOnly(request: MarketDataRequest): Promise<AcquireResult | null> {
    const acquisitionKey = buildAcquisitionKey(request);
    const keys = storageKeysFor(acquisitionKey);
    const snapshot = await this.readFreshSnapshot(keys.latest, request.providerScope, request.interval);
    if (!snapshot) return null;
    this.emitMetric('hits');
    return this.hitResult(snapshot, acquisitionKey);
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

  private emitMetric(metric: 'hits' | 'misses' | 'waiters' | 'upstream' | 'errors' | 'quotaBlocked'): void {
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

  /**
   * Hard physical-request ceiling. Reads the scope's Redis hourly/daily counters
   * and, if a fetch would exceed the budget, either refuses it (enforce) or logs
   * what it would have refused (observe). On refusal it writes a short quota
   * negative-cache record so concurrent waiters for the same key fail fast
   * instead of piling onto the exhausted provider, then throws. No-op when
   * quota counting is disabled.
   */
  private async enforceQuota(providerScope: string, errorKey: string): Promise<boolean> {
    if (!this.config.quotaEnabled) return false;
    const budget = getProviderBudget(providerScope);
    let decision;
    try {
      decision = await reserveRequest(this.store, providerScope, this.now(), budget);
    } catch {
      if (!this.config.quotaEnforce) {
        console.warn(`[scanner] quota coordination unavailable for ${providerScope}; observe mode allows request`);
        return false;
      }
      await this.writeNegativeCache(errorKey, 'quota coordination unavailable');
      throw new QuotaExceededError(`quota coordination unavailable for ${providerScope}`);
    }
    if (decision.allowed) return true; // permit already reserved atomically

    this.emitMetric('quotaBlocked');
    if (!this.config.quotaEnforce) {
      // Observe mode: surface what enforcement WOULD block, then allow the fetch.
      console.warn(`[scanner] quota (observe) would block ${providerScope}: ${decision.reason}`);
      // Observe mode still counts the physical attempt after the fetch.
      return false;
    }
    await this.writeNegativeCache(errorKey, `quota: ${decision.reason}`);
    throw new QuotaExceededError(`upstream quota exceeded for ${providerScope}: ${decision.reason}`);
  }

  private async acquire(
    request: MarketDataRequest,
    acquisitionKey: string,
    assetClass: AssetClass,
  ): Promise<AcquireResult> {
    const keys = storageKeysFor(acquisitionKey);

    // 1. Fresh snapshot already present?
    const cached = await this.readFreshSnapshot(keys.snapshot, request.providerScope, request.interval);
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
      // Physical-request quota gate: this is the one place a real upstream fetch
      // happens on the owner path, so it is the choke point for the hard ceiling.
      const quotaReserved = this.quotaAtProviderBoundary
        ? false
        : await this.enforceQuota(request.providerScope, keys.error);

      // The one upstream request (records exactly one provider request).
      this.emitMetric('upstream');
      this.emitMetric('misses');
      const result = await this.fetchFn(request.canonicalSymbol, request.interval, assetClass);
      // Count the physical request against the scope's fast Redis counters
      // (the durable Postgres audit is recorded separately by trackProvider).
      // In enforce mode the atomic permit was already counted. In observe mode,
      // a denied permit was not incremented, so retain best-effort accounting.
      if (this.config.quotaEnabled && !this.quotaAtProviderBoundary && !quotaReserved) {
        void recordRequest(this.store, request.providerScope, this.now());
      }
      await this.writeSnapshot(keys, request, result);
      return {
        candles: result.candles,
        provider: result.provider,
        cacheHit: false,
        acquisitionKey,
      };
    } catch (err) {
      // A quota denial already wrote its own negative-cache record and metric in
      // enforceQuota; don't double-count it as a provider error.
      if (!(err instanceof QuotaExceededError)) {
        this.emitMetric('errors');
        const message = err instanceof Error ? err.message : 'provider fetch failed';
        await this.writeNegativeCache(keys.error, message);
      }
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

      const snapshot = await this.readFreshSnapshot(keys.snapshot, request.providerScope, request.interval);
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
    keys: Pick<StorageKeys, 'snapshot' | 'latest'>,
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
      await Promise.all([
        this.store.set(
          keys.snapshot,
          JSON.stringify(snapshot),
          this.snapshotTtlMsFor(request.providerScope, request.interval),
        ),
        this.store.set(
          keys.latest,
          JSON.stringify(snapshot),
          this.latestSnapshotTtlMsFor(request.providerScope, request.interval),
        ),
      ]);
    } catch {
      // Disposable: worst case the next equivalent request fetches again.
    }
  }

  private async writeNegativeCache(errorKey: string, message: string): Promise<void> {
    const is404 = message.includes('404') || message.toLowerCase().includes('not found');
    const ttlMs = is404 ? 86_400_000 : this.config.negativeCacheTtlMs; // 24 hours for non-existent symbols
    const record = JSON.stringify({ message, is404, at: new Date(this.now()).toISOString() });
    try {
      await this.store.set(errorKey, record, ttlMs);
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
    interval?: string,
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
    const ttl = storageKey.startsWith('market-data:latest:')
      ? this.latestSnapshotTtlMsFor(providerScope, interval)
      : this.snapshotTtlMsFor(providerScope, interval);
    if (this.now() - fetchedAtMs > ttl) return null;

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
