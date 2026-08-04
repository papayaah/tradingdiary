import { describe, it, expect } from 'vitest';
import {
  computeInventory,
  sessionWindowSeconds,
  type AcquisitionEntry,
} from './acquisition-inventory';

const entry = (over: Partial<AcquisitionEntry> = {}): AcquisitionEntry => ({
  providerScope: 'tiingo:server',
  providerName: 'Tiingo',
  canonicalSymbol: 'AAPL',
  interval: '10m',
  scanFrequencySeconds: 600,
  windowSeconds: 12 * 3600,
  monthlyBarSeconds: 1_000,
  ...over,
});

describe('sessionWindowSeconds', () => {
  it('maps equity sessions and treats non-equity as always-on', () => {
    expect(sessionWindowSeconds('rth', 'equity')).toBe(6.5 * 3600);
    expect(sessionWindowSeconds('pre', 'equity')).toBe(12 * 3600);
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

  it('takes the fastest requested cadence and the longest window per scope', () => {
    const inv = computeInventory([
      entry({ canonicalSymbol: 'AAPL', scanFrequencySeconds: 600, windowSeconds: 12 * 3600 }),
      entry({ canonicalSymbol: 'MSFT', scanFrequencySeconds: 60, windowSeconds: 16 * 3600 }),
    ]);
    expect(inv[0].fastestRequestedSeconds).toBe(60);
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
