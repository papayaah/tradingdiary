import { describe, expect, it } from 'vitest';
import { buildScannerSyncWatchlist } from './sync-settings';

const watches = [
  { symbol: 'KORU', interval: '10m' },
  { symbol: 'SOXL', interval: '10m' },
];

describe('buildScannerSyncWatchlist', () => {
  it('keeps per-symbol scanner subscriptions free of global settings', () => {
    expect(buildScannerSyncWatchlist(watches)).toEqual(watches);
  });
});
