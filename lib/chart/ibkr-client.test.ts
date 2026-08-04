import { describe, expect, it } from 'vitest';
import { ibkrContractSpecForRoot } from './ibkr-client';

describe('IBKR futures contract routing', () => {
  it.each([
    ['NIY', { symbol: 'NIY', exchange: 'CME', currency: 'JPY' }],
    ['K200', { symbol: 'K200', exchange: 'KSE', currency: 'KRW' }],
    ['HSI', { symbol: 'HSI', exchange: 'HKFE', currency: 'HKD' }],
    ['SPI', { symbol: 'SPI', exchange: 'SNFE', currency: 'AUD' }],
    ['SSG', { symbol: 'SSG', exchange: 'SGX', currency: 'SGD' }],
  ])('routes %s to its native contract', (root, expected) => {
    expect(ibkrContractSpecForRoot(root)).toEqual(expected);
  });

  it('preserves existing aliases and CME defaults', () => {
    expect(ibkrContractSpecForRoot('BTC')).toEqual({
      symbol: 'BRR',
      exchange: 'CME',
      currency: 'USD',
    });
  });
});
