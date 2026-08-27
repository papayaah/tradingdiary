import { describe, expect, it, vi } from 'vitest';
import { AcquisitionScheduler, acquisitionSeriesId } from './acquisition-scheduler';
import { MemoryCacheStore } from './shared/memory-cache-store';
import type { AcquisitionEntry } from './shared/acquisition-inventory';

const series = (symbol: string): AcquisitionEntry => ({
  providerScope: 'tiingo:server',
  cadenceScope: 'tiingo:equity:server',
  providerName: 'Tiingo',
  canonicalSymbol: symbol,
  sourceSymbol: symbol,
  assetClass: 'equity',
  interval: '1m',
  scanFrequencySeconds: 999,
  windowSeconds: 16 * 3600,
  monthlyBarSeconds: 1,
});

describe('AcquisitionScheduler', () => {
  it('acquires the stalest series and staggers a provider scope', async () => {
    let now = Date.parse('2026-08-06T14:00:00Z');
    const fetched: string[] = [];
    const scheduler = new AcquisitionScheduler({
      store: new MemoryCacheStore(() => now),
      now: () => now,
      cadenceForScope: () => 60,
      inventoryRefreshMs: 60_000,
      loadSeries: async () => [series('AAPL'), series('MSFT')],
      service: {
        getCandlesForWatch: vi.fn(async (symbol: string) => {
          fetched.push(symbol);
          return { candles: [], provider: 'Tiingo', cacheHit: false, acquisitionKey: symbol };
        }),
      } as never,
    });

    expect((await scheduler.tick()).acquired).toBe(1);
    expect((await scheduler.tick()).acquired).toBe(0); // dispatch lease staggers the scope
    now += 30_000;
    expect((await scheduler.tick()).acquired).toBe(1);
    expect(new Set(fetched)).toEqual(new Set(['AAPL', 'MSFT']));
  });

  it('does not let a failed series starve healthy series in the same scope', async () => {
    let now = Date.parse('2026-08-06T14:00:00Z');
    const entries = [series('EA'), series('SOXL')]
      .sort((a, b) => acquisitionSeriesId(a).localeCompare(acquisitionSeriesId(b)));
    const failingSymbol = entries[0].canonicalSymbol;
    const attempted: string[] = [];
    const scheduler = new AcquisitionScheduler({
      store: new MemoryCacheStore(() => now),
      now: () => now,
      cadenceForScope: () => 60,
      inventoryRefreshMs: 60_000,
      loadSeries: async () => entries,
      service: {
        getCandlesForWatch: vi.fn(async (symbol: string) => {
          attempted.push(symbol);
          if (symbol === failingSymbol) throw new Error('malformed upstream response');
          return { candles: [], provider: 'Tiingo', cacheHit: false, acquisitionKey: symbol };
        }),
      } as never,
    });

    expect((await scheduler.tick()).acquired).toBe(0);
    now += 30_000;
    expect((await scheduler.tick()).acquired).toBe(1);
    expect(attempted).toEqual([failingSymbol, entries[1].canonicalSymbol]);
  });
});
