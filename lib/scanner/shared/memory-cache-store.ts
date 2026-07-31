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
}
