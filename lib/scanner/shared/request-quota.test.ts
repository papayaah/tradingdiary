import { describe, it, expect } from 'vitest';
import { MemoryCacheStore } from './memory-cache-store';
import type { ProviderBudget } from './governor';
import {
  hourKey,
  dayKey,
  readUsage,
  recordRequest,
  checkQuota,
  reserveRequest,
} from './request-quota';

const budget = (over: Partial<ProviderBudget> = {}): ProviderBudget => ({
  hourlyCap: 100,
  dailyCap: 1000,
  monthlyBandwidthBytes: 0,
  estimatedBytesPerBar: 0,
  headroom: 0.8,
  floorSeconds: 15,
  ...over,
});

const T = Date.parse('2026-08-04T09:30:00.000Z');

describe('request-quota keys', () => {
  it('buckets by UTC hour and day', () => {
    expect(hourKey('tiingo:server', T)).toBe('quota:req:tiingo:server:h:2026080409');
    expect(dayKey('tiingo:server', T)).toBe('quota:req:tiingo:server:d:20260804');
  });

  it('rolls to a new key in the next hour/day', () => {
    const nextHour = T + 3_600_000;
    const nextDay = T + 86_400_000;
    expect(hourKey('s', nextHour)).not.toBe(hourKey('s', T));
    expect(dayKey('s', nextDay)).not.toBe(dayKey('s', T));
  });
});

describe('readUsage / recordRequest', () => {
  it('reads zero before anything is recorded', async () => {
    const store = new MemoryCacheStore(() => T);
    expect(await readUsage(store, 'tiingo:server', T)).toEqual({ hourly: 0, daily: 0 });
  });

  it('counts each recorded request in both the hour and day buckets', async () => {
    const store = new MemoryCacheStore(() => T);
    await recordRequest(store, 'tiingo:server', T);
    await recordRequest(store, 'tiingo:server', T);
    expect(await readUsage(store, 'tiingo:server', T)).toEqual({ hourly: 2, daily: 2 });
  });

  it('keeps separate counts per scope', async () => {
    const store = new MemoryCacheStore(() => T);
    await recordRequest(store, 'tiingo:server', T);
    await recordRequest(store, 'ibkr-cme:server', T);
    expect((await readUsage(store, 'tiingo:server', T)).daily).toBe(1);
    expect((await readUsage(store, 'ibkr-cme:server', T)).daily).toBe(1);
  });
});

describe('checkQuota', () => {
  it('allows while under both caps', () => {
    expect(checkQuota({ hourly: 10, daily: 10 }, budget()).allowed).toBe(true);
  });

  it('denies at the hourly cap and names the term', () => {
    const d = checkQuota({ hourly: 100, daily: 10 }, budget());
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('hourly');
  });

  it('denies at the daily cap', () => {
    const d = checkQuota({ hourly: 10, daily: 1000 }, budget());
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('daily');
  });

  it('treats a zero/absent cap as unlimited for that term', () => {
    expect(checkQuota({ hourly: 9_999, daily: 5 }, budget({ hourlyCap: 0 })).allowed).toBe(true);
  });
});

describe('reserveRequest', () => {
  it('atomically grants only the remaining permits under concurrency', async () => {
    const store = new MemoryCacheStore(() => T);
    const decisions = await Promise.all(
      Array.from({ length: 20 }, () =>
        reserveRequest(store, 'tiingo:server', T, budget({ hourlyCap: 5, dailyCap: 50 })),
      ),
    );
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    expect(await readUsage(store, 'tiingo:server', T)).toEqual({ hourly: 5, daily: 5 });
  });
});
