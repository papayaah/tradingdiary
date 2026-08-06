// In-memory CacheStore faithfully mirroring the Redis semantics SharedCandleService
// relies on: PX expiry, SET-NX lock acquisition, and compare-and-delete release.
//
// Used by tests (hermetic, no Redis required) and usable as a single-process dev
// fallback. The clock is injectable so TTL/expiry behavior is deterministic; a
// shared instance passed to two SharedCandleService objects models two worker
// processes contending on one Redis.

import type { CacheStore } from './cache-store';

interface Entry {
  value: string;
  expiresAt: number;
}

export class MemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, Entry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private live(key: string): Entry | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.map.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  async acquireLock(key: string, token: string, ttlMs: number): Promise<boolean> {
    if (this.live(key)) return false; // held (SET NX fails)
    this.map.set(key, { value: token, expiresAt: this.now() + ttlMs });
    return true;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    if (this.live(key)?.value === token) this.map.delete(key);
  }

  async incr(key: string, ttlMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const existing = this.live(key);
    const currentVal = existing ? parseInt(existing.value, 10) || 0 : 0;
    const newVal = currentVal + 1;
    const expiresAt = existing ? existing.expiresAt : this.now() + ttlMs;
    this.map.set(key, { value: String(newVal), expiresAt });
    return newVal;
  }

  async hset(key: string, fieldValues: Record<string, string>): Promise<void> {
    const existingStr = (await this.get(key)) ?? '{}';
    let parsed: Record<string, string> = {};
    try {
      parsed = JSON.parse(existingStr);
    } catch {
      parsed = {};
    }
    Object.assign(parsed, fieldValues);
    await this.set(key, JSON.stringify(parsed), 7 * 24 * 60 * 60 * 1000);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const existingStr = await this.get(key);
    if (!existingStr) return {};
    try {
      return JSON.parse(existingStr);
    } catch {
      return {};
    }
  }

  async reserveQuota(
    hourKey: string,
    dayKey: string,
    hourlyCap: number,
    dailyCap: number,
    hourTtlMs: number,
    dayTtlMs: number,
  ): Promise<{ allowed: boolean; hourly: number; daily: number }> {
    const hourly = Number.parseInt(this.live(hourKey)?.value ?? '0', 10) || 0;
    const daily = Number.parseInt(this.live(dayKey)?.value ?? '0', 10) || 0;
    if ((hourlyCap > 0 && hourly >= hourlyCap) || (dailyCap > 0 && daily >= dailyCap)) {
      return { allowed: false, hourly, daily };
    }
    const nextHourly = await this.incr(hourKey, hourTtlMs);
    const nextDaily = await this.incr(dayKey, dayTtlMs);
    return { allowed: true, hourly: nextHourly, daily: nextDaily };
  }
}
