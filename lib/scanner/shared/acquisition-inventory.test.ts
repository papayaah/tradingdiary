import { describe, it, expect } from 'vitest';
import {
  computeInventory,
  entryForWatch,
  acquisitionInterval,
  sessionWindowSeconds,
  isProviderAcquisitionActive,
  type AcquisitionEntry,
} from './acquisition-inventory';
import { getProviderCapability } from './provider-capabilities';

const entry = (over: Partial<AcquisitionEntry> = {}): AcquisitionEntry => ({
  providerScope: 'tiingo:server',
  providerName: 'Tiingo',
  canonicalSymbol: 'AAPL',
  interval: '10m',
  scanFrequencySeconds: 600,
  windowSeconds: 12 * 3600,
  monthlyBarSeconds: 1_000,
  sourceSymbol: 'AAPL',
  assetClass: 'equity',
  ...over,
});

describe('isProviderAcquisitionActive', () => {
  it('uses the server-owned 04:00-20:00 New York equity window', () => {
    expect(isProviderAcquisitionActive('equity', new Date('2026-08-06T07:59:00Z'))).toBe(false);
    expect(isProviderAcquisitionActive('equity', new Date('2026-08-06T08:00:00Z'))).toBe(true);
    expect(isProviderAcquisitionActive('equity', new Date('2026-08-07T00:00:00Z'))).toBe(false);
  });

  it('keeps crypto and futures independent of user sessions', () => {
    const saturday = new Date('2026-08-08T12:00:00Z');
    expect(isProviderAcquisitionActive('crypto', saturday)).toBe(true);
    expect(isProviderAcquisitionActive('futures', saturday)).toBe(true);
  });
});

describe('sessionWindowSeconds', () => {
  it('uses the provider-owned equity window and treats non-equity as always-on', () => {
    expect(sessionWindowSeconds('rth', 'equity')).toBe(16 * 3600);
    expect(sessionWindowSeconds('pre', 'equity')).toBe(16 * 3600);
    expect(sessionWindowSeconds('ext', 'equity')).toBe(16 * 3600);
    expect(sessionWindowSeconds('all', 'equity')).toBe(16 * 3600);
    expect(sessionWindowSeconds('rth', 'crypto')).toBe(24 * 3600);
    expect(sessionWindowSeconds('rth', 'futures')).toBe(24 * 3600);
  });
});

describe('computeInventory', () => {
  it('counts unique (symbol, interval) keys per scope', () => {
    const inv = computeInventory([
      entry({ canonicalSymbol: 'AAPL', interval: '10m' }),
      entry({ canonicalSymbol: 'AAPL', interval: '10m' }), // duplicate watch -> not a new key
      entry({ canonicalSymbol: 'AAPL', interval: '1m' }), // different interval -> new key
      entry({ canonicalSymbol: 'MSFT', interval: '10m' }),
    ]);
    expect(inv).toHaveLength(1);
    expect(inv[0].uniqueKeys).toBe(3);
  });

  it('ignores user cadence and keeps the provider-owned window per scope', () => {
    const inv = computeInventory([
      entry({ canonicalSymbol: 'AAPL', scanFrequencySeconds: 600, windowSeconds: 12 * 3600 }),
      entry({ canonicalSymbol: 'MSFT', scanFrequencySeconds: 60, windowSeconds: 16 * 3600 }),
    ]);
    expect(inv[0].providerTargetSeconds).toBe(0);
    expect(inv[0].windowSeconds).toBe(16 * 3600);
  });

  it('separates provider scopes', () => {
    const inv = computeInventory([
      entry({ providerScope: 'tiingo:server', providerName: 'Tiingo', canonicalSymbol: 'AAPL' }),
      entry({ providerScope: 'ibkr-cme:server', providerName: 'IBKR (CME)', canonicalSymbol: 'MNQ=F' }),
    ]);
    expect(inv.map((i) => i.providerScope).sort()).toEqual(['ibkr-cme:server', 'tiingo:server']);
    expect(inv.every((i) => i.uniqueKeys === 1)).toBe(true);
  });

  it('counts bandwidth demand once per shared key using the largest scope', () => {
    const inv = computeInventory([
      entry({ canonicalSymbol: 'AAPL', monthlyBarSeconds: 1_000 }),
      entry({ canonicalSymbol: 'AAPL', monthlyBarSeconds: 2_000 }),
      entry({ canonicalSymbol: 'MSFT', monthlyBarSeconds: 3_000 }),
    ]);
    expect(inv[0].monthlyBarSeconds).toBe(5_000);
  });
});

describe('acquisitionInterval', () => {
  // Equities with no API keys in the test env resolve to Yahoo, which is
  // aggregatableFrom1m: true.
  const aggregatable = getProviderCapability('Yahoo Finance', 'equity');
  const notAggregatable = getProviderCapability('Unknown Provider', 'equity');

  it('collapses minute intervals to the 1m base when aggregation is on', () => {
    expect(acquisitionInterval('10m', aggregatable, true)).toBe('1m');
    expect(acquisitionInterval('5m', aggregatable, true)).toBe('1m');
    expect(acquisitionInterval('1m', aggregatable, true)).toBe('1m');
  });

  it('keeps the native interval when aggregation is off', () => {
    expect(acquisitionInterval('10m', aggregatable, false)).toBe('10m');
    expect(acquisitionInterval('5m', aggregatable, false)).toBe('5m');
  });

  it('keeps the native interval for non-aggregatable providers even when on', () => {
    // DEFAULT_CAPABILITY has aggregatableFrom1m: false.
    expect(notAggregatable.aggregatableFrom1m).toBe(false);
    expect(acquisitionInterval('10m', notAggregatable, true)).toBe('10m');
  });

  it('keeps sub-minute (unparseable) intervals native — they cannot derive from 1m', () => {
    expect(acquisitionInterval('30s', aggregatable, true)).toBe('30s');
  });
});

describe('entryForWatch symbol-only collapse', () => {
  const watch = (over: Partial<{ symbol: string; interval: string }> = {}) => ({
    symbol: 'AAPL',
    interval: '10m',
    assetClass: 'equity',
    session: 'all',
    scanFrequencySeconds: 60,
    ...over,
  });

  it('folds a symbol watched at many intervals into ONE acquisition when aggregation is on', () => {
    const entries = [
      entryForWatch(watch({ interval: '1m' }), true),
      entryForWatch(watch({ interval: '5m' }), true),
      entryForWatch(watch({ interval: '10m' }), true),
      entryForWatch(watch({ interval: '15m' }), true),
    ];
    const inv = computeInventory(entries);
    expect(inv).toHaveLength(1);
    expect(inv[0].uniqueKeys).toBe(1); // one 1m base series for AAPL
    expect(entries.every((e) => e.interval === '1m')).toBe(true);
  });

  it('keeps one acquisition per interval when aggregation is off (unchanged behavior)', () => {
    const entries = [
      entryForWatch(watch({ interval: '1m' }), false),
      entryForWatch(watch({ interval: '5m' }), false),
      entryForWatch(watch({ interval: '10m' }), false),
    ];
    expect(computeInventory(entries)[0].uniqueKeys).toBe(3);
  });

  it('sizes bandwidth at the 1m base (more bars than the display interval)', () => {
    const oneMin = entryForWatch(watch({ interval: '10m' }), true);
    const tenMin = entryForWatch(watch({ interval: '10m' }), false);
    // Same window, but the 1m base has ~10x the bars of a native 10m fetch.
    expect(oneMin.monthlyBarSeconds).toBeGreaterThan(tenMin.monthlyBarSeconds);
  });
});
