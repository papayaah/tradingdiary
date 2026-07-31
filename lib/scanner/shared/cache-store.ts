// Minimal string cache abstraction backing the shared candle snapshot store.
//
// SharedCandleService depends on this narrow interface (not on ioredis directly)
// so it can be unit-tested with an in-memory store and no running Redis, while
// production uses a dedicated Redis connection. Snapshots are disposable: Redis
// loss only forces the next scan to repopulate from the provider (PostgreSQL
// remains authoritative for watch state and alerts).

// @ts-ignore - no bundled types in this project's setup
import IORedis from 'ioredis';
import { scannerConfig } from '@/lib/scanner/env';

export interface CacheStore {
  /** Return the stored value, or null if absent/expired. */
  get(key: string): Promise<string | null>;
  /** Store a value with a TTL in milliseconds. */
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /**
   * Atomically acquire a lock: set `key` to `token` with a TTL only if `key`
   * does not already exist (Redis SET NX PX). Returns true iff acquired.
   */
  acquireLock(key: string, token: string, ttlMs: number): Promise<boolean>;
  /**
   * Release a lock only if it is still owned by `token` (compare-and-delete),
   * so one worker can never release another worker's lock. No-op otherwise.
   */
  releaseLock(key: string, token: string): Promise<void>;
}

// Compare-and-delete: only remove the lock if we still own it. Runs atomically
// server-side so a lock that expired and was re-acquired by another worker is
// never deleted by the previous owner.
const RELEASE_LOCK_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

/** Redis-backed store using PX (millisecond) expiry. */
export class RedisCacheStore implements CacheStore {
  constructor(private readonly redis: IORedis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.redis.set(key, value, 'PX', Math.max(1, Math.floor(ttlMs)));
  }

  async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    const res = await this.redis.set(key, token, 'PX', Math.max(1, Math.floor(ttlMs)), 'NX');
    return res === 'OK';
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_LOCK_LUA, 1, key, token);
  }
}

let sharedStore: CacheStore | null = null;

/** Process-wide Redis-backed cache store for shared candle snapshots. */
export function getSharedCacheStore(): CacheStore {
  if (!sharedStore) {
    const redis = new IORedis(scannerConfig.redisUrl, { maxRetriesPerRequest: null });
    sharedStore = new RedisCacheStore(redis);
  }
  return sharedStore;
}
