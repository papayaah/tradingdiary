import { describe, expect, it } from 'vitest';
import { buildScannerSyncWatchlist } from './sync-settings';

const watches = [
  { symbol: 'KORU', interval: '10m', minMovePercent: 0.5 },
  { symbol: 'SOXL', interval: '10m', minMovePercent: 0.25 },
];

describe('buildScannerSyncWatchlist', () => {
  it('applies the global threshold to every watch when override is enabled', () => {
    expect(buildScannerSyncWatchlist(watches, 0.15)).toEqual([
      { symbol: 'KORU', interval: '10m', minMovePercent: 0.15 },
      { symbol: 'SOXL', interval: '10m', minMovePercent: 0.15 },
    ]);
  });

  it('preserves individual thresholds when global override is disabled', () => {
    expect(buildScannerSyncWatchlist(watches, null)).toEqual(watches);
  });
});
