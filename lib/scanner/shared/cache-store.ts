// Minimal string cache abstraction backing the shared candle snapshot store.
//
// SharedCandleService depends on this narrow interface (not on ioredis directly)
// so it can be unit-tested with an in-memory store and no running Redis, while
// production uses a dedicated Redis connection. Snapshots are disposable: Redis
// loss only forces the next scan to repopulate from the provider (PostgreSQL
// remains authoritative for watch state and alerts).

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
  /** Increment a numeric counter key with an optional TTL in milliseconds. */
  incr(key: string, ttlMs?: number): Promise<number>;
  /** Store field-value pairs in a hash. */
  hset(key: string, fieldValues: Record<string, string>): Promise<void>;
  /** Retrieve all fields and values from a hash. */
  hgetall(key: string): Promise<Record<string, string>>;
  /**
   * Atomically reserve one request against hourly and daily counters. Neither
   * counter is changed when either cap is exhausted.
   */
  reserveQuota(
    hourKey: string,
    dayKey: string,
    hourlyCap: number,
    dailyCap: number,
    hourTtlMs: number,
    dayTtlMs: number,
  ): Promise<{ allowed: boolean; hourly: number; daily: number }>;
}

// Compare-and-delete: only remove the lock if we still own it. Runs atomically
// server-side so a lock that expired and was re-acquired by another worker is
// never deleted by the previous owner.
const RELEASE_LOCK_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

const RESERVE_QUOTA_LUA = `
local hourly = tonumber(redis.call('get', KEYS[1]) or '0')
local daily = tonumber(redis.call('get', KEYS[2]) or '0')
local hourlyCap = tonumber(ARGV[1])
local dailyCap = tonumber(ARGV[2])
if (hourlyCap > 0 and hourly >= hourlyCap) or (dailyCap > 0 and daily >= dailyCap) then
  return {0, hourly, daily}
end
hourly = redis.call('incr', KEYS[1])
daily = redis.call('incr', KEYS[2])
if hourly == 1 then redis.call('pexpire', KEYS[1], ARGV[3]) end
if daily == 1 then redis.call('pexpire', KEYS[2], ARGV[4]) end
return {1, hourly, daily}`;

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

  async incr(key: string, ttlMs?: number): Promise<number> {
    const val = await this.redis.incr(key);
    if (val === 1 && ttlMs && ttlMs > 0) {
      await this.redis.pexpire(key, Math.floor(ttlMs)).catch(() => {});
    }
    return val;
  }

  async hset(key: string, fieldValues: Record<string, string>): Promise<void> {
    await this.redis.hset(key, fieldValues);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }

  async reserveQuota(
    hourKey: string,
    dayKey: string,
    hourlyCap: number,
    dailyCap: number,
    hourTtlMs: number,
    dayTtlMs: number,
  ): Promise<{ allowed: boolean; hourly: number; daily: number }> {
    const raw = (await this.redis.eval(
      RESERVE_QUOTA_LUA,
      2,
      hourKey,
      dayKey,
      hourlyCap,
      dailyCap,
      Math.max(1, Math.floor(hourTtlMs)),
      Math.max(1, Math.floor(dayTtlMs)),
    )) as Array<number | string>;
    return {
      allowed: Number(raw[0]) === 1,
      hourly: Number(raw[1]) || 0,
      daily: Number(raw[2]) || 0,
    };
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
